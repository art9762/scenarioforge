# ScenarioForge v2 — Plan

## Summary

Превратить ScenarioForge из однопользовательского инструмента в многопользовательскую платформу с аутентификацией, командами (workspaces), ролевой моделью, системой кредитов и админ-панелью.

### Что уже есть (backend)
- JWT auth (login, register, refresh) — работает, но не подключён к проектным эндпоинтам
- Модели User, ProjectRecord, UsageRecord, InviteCode, CreditCode — таблицы создаются
- Admin API (CRUD юзеров, генерация инвайтов/кредитов, статистика) — работает
- Usage tracking (record_tokens, record_generation) — записывает, но лимиты не enforce'ятся

### Что уже есть (frontend)
- Admin.tsx — управление юзерами, инвайтами, кредитами (UI готов)
- API client — методы login/register/redeemCode/admin* написаны
- Layout — показывает admin-ссылку и кредиты если auth_enabled

### Что отсутствует
- Frontend: страницы Login/Register, AuthContext, protected routes, logout
- Backend: изоляция проектов по пользователям, проверка доступа
- Backend + Frontend: команды (workspaces), ролевая модель, кредиты команд
- Backend: Alembic миграции (сейчас `create_all()`)
- Backend: enforce tier-лимитов в эндпоинтах

---

## Архитектура

### Модель данных

```
User (существует)
├── id, email, hashed_password, display_name
├── is_active, is_admin, credits (личный баланс)
├── tier (free/pro), invited_by
│
├── TeamMember[] ──→ Team[]
│   └── role: owner | editor | viewer
│
└── ProjectRecord[]  (личные проекты, team_id = NULL)

Team (новое)
├── id, name, slug (URL-friendly)
├── credits (командный баланс)
├── created_by (FK → User)
├── created_at
│
├── TeamMember[]
│   └── user_id, role, joined_at
│
└── ProjectRecord[]  (командные проекты)

ProjectRecord (расширяется)
├── ...существующие поля...
├── team_id (FK → Team, nullable)  ← НОВОЕ
└── user_id = кто создал проект

InviteCode (существует, без изменений)
└── Глобальные коды для регистрации, создаёт только админ

CreditCode (существует, без изменений)
└── Глобальные коды на кредиты
```

### Ролевая модель команд

| Действие | Owner | Editor | Viewer |
|----------|-------|--------|--------|
| Смотреть проекты | + | + | + |
| Создавать проекты | + | + | - |
| Редактировать сценарии | + | + | - |
| Запускать генерацию | + | + | - |
| Удалять проекты | + | свои | - |
| Приглашать в команду | + | - | - |
| Менять роли участников | + | - | - |
| Удалять команду | + | - | - |
| Менять кредиты команды | + (через код) | - | - |
| Перевести личные кредиты в пул | + | + | + |

### Система кредитов

- **Личный баланс** (`User.credits`) — для личных проектов
- **Командный баланс** (`Team.credits`) — для командных проектов
- При запуске генерации кредит списывается с:
  - Личного баланса → если проект личный (team_id = NULL)
  - Командного баланса → если проект командный
- **Перевод кредитов:** любой участник команды может перевести свои личные кредиты в командный пул (необратимо). API: `POST /api/teams/{slug}/transfer-credits { amount: number }`. UI: кнопка "Пополнить командный баланс" в настройках команды
- Админ может через панель менять кредиты пользователей и команд
- CreditCode может быть активирован на личный баланс или на команду (owner выбирает)

### Регистрация (flow)

```
1. Пользователь открывает /login
2. Нажимает "Регистрация"
3. Вводит invite-код → система проверяет валидность
4. Если код валиден → показывает форму: email, display_name, пароль
5. Регистрация → автоматический вход
6. Попадает на главную (личное пространство)
```

---

## Фазы реализации

### Фаза 1: Аутентификация и изоляция проектов

**Цель:** Пользователи регистрируются по инвайту, видят только свои проекты.

#### 1.1 Backend: Изоляция проектов по пользователям

**Файлы:** `backend/main.py`, `backend/auth/deps.py`

- Добавить `user: User = Depends(get_current_user)` ко **всем** проектным эндпоинтам (вместо `get_current_user_optional`)
- `POST /api/projects` — создавать `ProjectRecord` в БД с `user_id`; возвращать проект только если запись создана
- `GET /api/projects` — фильтровать через `ProjectRecord` по `user_id` (не сканировать весь `data/`)
- Все остальные `/api/projects/{id}/*` — проверять через `ProjectRecord`, что проект принадлежит текущему пользователю
- Хелпер `_check_project_access(project_id, user, db)`:
  ```python
  async def _check_project_access(project_id: str, user: User, db: AsyncSession):
      record = await db.execute(
          select(ProjectRecord).where(
              ProjectRecord.id == project_id,
              ProjectRecord.user_id == user.id
          )
      )
      if not record.scalar_one_or_none():
          raise HTTPException(403, "Access denied")
  ```
- Если `AUTH_ENABLED=false` — все работает как раньше (без проверок, без user)

#### 1.2 Backend: Enforce tier-лимитов

**Файлы:** `backend/main.py`, `backend/services/usage.py`

- В `POST /api/projects/{id}/generate`:
  ```python
  allowed, reason = await check_generation_allowed(db, user, data.depth_mode)
  if not allowed:
      raise HTTPException(403, reason)
  await record_generation(db, user.id)
  ```
- Убрать текущую логику `if user.credits <= 0` — заменить на `check_generation_allowed`
- Добавить `GET /api/usage` — статистика текущего пользователя (вызов `get_usage_stats`)

#### 1.3 Frontend: Auth UI

**Новые файлы:**
- `frontend/src/contexts/AuthContext.tsx`
- `frontend/src/pages/Login.tsx`
- `frontend/src/pages/Register.tsx`
- `frontend/src/components/ProtectedRoute.tsx`

**`AuthContext.tsx`:**
```typescript
interface AuthState {
  user: UserInfo | null
  token: string | null
  isAuthenticated: boolean
  authEnabled: boolean
  loading: boolean
  login: (email: string, password: string) => Promise<void>
  register: (inviteCode: string, email: string, password: string, displayName: string) => Promise<void>
  logout: () => void
}
```
- На mount: `GET /api/auth/me` → определить `authEnabled` и текущего юзера
- Token refresh: если 401 → пробовать `/api/auth/refresh` → если не получилось → logout
- Сохранение в `localStorage`: `access_token`, `refresh_token`

**`Login.tsx`:**
- Тёмный минималистичный дизайн (в стиле приложения)
- Поля: email, пароль
- Кнопки: "Войти", ссылка "Регистрация"
- Ошибки: "Неверный email или пароль", "Аккаунт заблокирован"

**`Register.tsx`** (двухшаговая форма):
- **Шаг 1:** Поле для ввода invite-кода. Кнопка "Далее". Валидация: `POST /api/auth/validate-code` (новый эндпоинт)
- **Шаг 2:** email, display_name, пароль, подтверждение пароля. Кнопка "Создать аккаунт"
- При ошибке инвайт-кода → "Недействительный или использованный код"

**`ProtectedRoute.tsx`:**
```tsx
// Если authEnabled && !isAuthenticated → redirect на /login
// Если !authEnabled → пропустить (работает как v1)
```

**Изменения в существующих файлах:**

- `App.tsx` — обернуть в `AuthProvider`; добавить `/login`, `/register`; все остальные роуты — через `ProtectedRoute`
- `Layout.tsx` — показать имя пользователя + кнопку logout; убрать кредиты для неавторизованных
- `api/client.ts` — добавить interceptor: при 401 → попробовать refresh → если не удалось → redirect на /login

#### 1.4 Backend: Новый эндпоинт валидации инвайт-кода

**Файл:** `backend/auth/routes.py`

```python
@router.post("/api/auth/validate-code")
async def validate_invite_code(data: ValidateCodeRequest, db):
    code = await db.execute(select(InviteCode).where(
        InviteCode.code == data.code,
        InviteCode.used_by == None
    ))
    if not code.scalar_one_or_none():
        raise HTTPException(400, "Invalid or used code")
    return {"valid": True}
```

#### 1.5 Backend: Alembic

**Новые файлы:** `backend/alembic/`, `backend/alembic.ini`

- Инициализировать Alembic с async SQLAlchemy
- Первая миграция: все существующие таблицы (User, ProjectRecord, UsageRecord, InviteCode, CreditCode)
- Заменить `create_all()` в lifespan на `alembic upgrade head`
- Добавить скрипт: `alembic revision --autogenerate -m "описание"`

**Файлы фазы 1:** ~8 файлов изменить, ~5 новых  
**Результат:** Приложение работает с аутентификацией. Каждый пользователь видит только свои проекты.

---

### Фаза 2: Команды (Workspaces)

**Цель:** Пользователи создают команды, приглашают участников, работают над общими проектами.

#### 2.1 Backend: Модели команд

**Файл:** `backend/db/models.py` (+ миграция)

```python
class Team(Base):
    __tablename__ = "teams"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    name = Column(String(255), nullable=False)
    slug = Column(String(100), unique=True, nullable=False, index=True)
    credits = Column(Integer, default=0, nullable=False)
    created_by = Column(String(36), ForeignKey("users.id"), nullable=False)
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    members = relationship("TeamMember", back_populates="team", cascade="all, delete-orphan")
    projects = relationship("ProjectRecord", back_populates="team")


class TeamMember(Base):
    __tablename__ = "team_members"
    id = Column(String(36), primary_key=True, default=lambda: str(uuid.uuid4()))
    team_id = Column(String(36), ForeignKey("teams.id"), nullable=False, index=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=False, index=True)
    role = Column(String(20), nullable=False)  # owner, editor, viewer
    joined_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
    
    team = relationship("Team", back_populates="members")
    user = relationship("User")
```

**ProjectRecord** — добавить:
```python
team_id = Column(String(36), ForeignKey("teams.id"), nullable=True, index=True)
team = relationship("Team", back_populates="projects")
```

#### 2.2 Backend: Team API

**Новый файл:** `backend/teams/routes.py`

```
POST   /api/teams                — создать команду (создатель = owner)
GET    /api/teams                — список команд текущего пользователя
GET    /api/teams/{slug}         — информация о команде + участники
PATCH  /api/teams/{slug}         — обновить название (owner only)
DELETE /api/teams/{slug}         — удалить команду (owner only)

POST   /api/teams/{slug}/members              — добавить участника (owner only)
PATCH  /api/teams/{slug}/members/{user_id}     — изменить роль (owner only)
DELETE /api/teams/{slug}/members/{user_id}     — удалить участника (owner only)
POST   /api/teams/{slug}/leave                 — покинуть команду (не owner)

POST   /api/teams/{slug}/redeem                — активировать кредит-код на команду (owner)
POST   /api/teams/{slug}/transfer-credits     — перевести личные кредиты в командный пул (любой участник)
```

**Схемы:**
```python
class CreateTeamRequest(BaseModel):
    name: str  # "Моя команда"

class AddMemberRequest(BaseModel):
    email: str       # найти пользователя по email
    role: str = "editor"  # editor | viewer

class UpdateMemberRequest(BaseModel):
    role: str  # owner | editor | viewer
```

#### 2.3 Backend: Обновление проектных эндпоинтов

**Файл:** `backend/main.py`

Проверка доступа становится двухуровневой:

```python
async def _check_project_access(project_id: str, user: User, db: AsyncSession, 
                                 require_edit: bool = False):
    record = await db.execute(
        select(ProjectRecord).where(ProjectRecord.id == project_id)
    )
    project = record.scalar_one_or_none()
    if not project:
        raise HTTPException(404, "Project not found")
    
    # Личный проект
    if project.team_id is None:
        if project.user_id != user.id:
            raise HTTPException(403, "Access denied")
        return project
    
    # Командный проект
    member = await db.execute(
        select(TeamMember).where(
            TeamMember.team_id == project.team_id,
            TeamMember.user_id == user.id
        )
    )
    membership = member.scalar_one_or_none()
    if not membership:
        raise HTTPException(403, "Access denied")
    
    if require_edit and membership.role == "viewer":
        raise HTTPException(403, "View-only access")
    
    return project
```

- `POST /api/projects` — принимает опциональный `team_id`; проверяет membership + роль
- `GET /api/projects` — возвращает личные + проекты всех команд пользователя
- `GET /api/projects?team={slug}` — фильтр по конкретной команде
- Все мутирующие эндпоинты (generate, revise, edit, delete) — `require_edit=True`
- Read-only эндпоинты (get, status, agents, revisions, chat history) — `require_edit=False`

**Кредиты при генерации:**
```python
if project_record.team_id:
    team = await db.get(Team, project_record.team_id)
    if team.credits <= 0:
        raise HTTPException(403, "Insufficient team credits")
    team.credits -= 1
else:
    if user.credits <= 0:
        raise HTTPException(403, "Insufficient credits")
    user.credits -= 1
```

#### 2.4 Frontend: Team UI

**Новые файлы:**
- `frontend/src/pages/Teams.tsx` — список команд + создание
- `frontend/src/pages/TeamSettings.tsx` — настройки команды, участники, роли
- `frontend/src/components/TeamSelector.tsx` — переключатель "Личные / Команда X / Команда Y" в header
- `frontend/src/types/index.ts` — типы Team, TeamMember

**`TeamSelector.tsx`:**
- Dropdown в header между лого и навигацией
- Опции: "Личные проекты" + список команд
- Выбор меняет контекст → `GET /api/projects?team=slug` или `GET /api/projects` (личные)
- Хранится в URL query param или context

**`Teams.tsx`:**
- Список команд с ролью пользователя
- Кнопка "Создать команду"
- Для каждой команды: название, количество участников, кредиты, роль

**`TeamSettings.tsx`:** (только для owner)
- Название команды (редактируемое)
- Список участников: email, роль, кнопки смены роли / удаления
- Форма добавления участника по email
- Ввод кредит-кода на команду
- Кнопка удаления команды (с подтверждением)

**Изменения:**
- `ProjectList.tsx` — фильтрация по выбранной команде/личному пространству
- `NewProject.tsx` — если выбрана команда → проект создаётся в команде
- `Layout.tsx` — встроить TeamSelector

**Файлы фазы 2:** ~6 файлов изменить, ~5 новых  
**Результат:** Полноценные команды с ролями, общими проектами и раздельными кредитами.

---

### Фаза 3: Расширение админ-панели

**Цель:** Админ управляет всей платформой.

#### 3.1 Backend: Расширение admin API

**Файл:** `backend/admin/routes.py`

Новые эндпоинты:
```
GET    /api/admin/teams              — все команды
PATCH  /api/admin/teams/{id}         — обновить кредиты команды
DELETE /api/admin/teams/{id}         — удалить команду

PATCH  /api/admin/users/{id}         — расширить: добавить tier, ban/unban
GET    /api/admin/activity           — лог активности (генерации, регистрации)
```

Расширение `UpdateUserRequest`:
```python
class UpdateUserRequest(BaseModel):
    credits: int | None = None
    is_active: bool | None = None    # ban/unban
    is_admin: bool | None = None
    tier: str | None = None          # free/pro
```

#### 3.2 Frontend: Расширение Admin.tsx

**Файл:** `frontend/src/pages/Admin.tsx`

Добавить табы:
- **Команды** — список всех команд, кредиты, участники; кнопка изменения кредитов
- **Активность** — лог последних действий (генерации, регистрации)

Улучшения существующих табов:
- **Пользователи** — добавить: кнопка бана (toggle is_active), смена tier (free/pro), поиск по email
- **Статистика** — графики (количество генераций по дням, расход токенов)

#### 3.3 Backend: Аудит-лог

**Новая модель:** `AuditLog`
```python
class AuditLog(Base):
    __tablename__ = "audit_log"
    id = Column(Integer, primary_key=True, autoincrement=True)
    user_id = Column(String(36), ForeignKey("users.id"), nullable=True)
    action = Column(String(50), nullable=False)  # register, login, generate, create_team, etc.
    details = Column(Text, nullable=True)  # JSON с деталями
    created_at = Column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc))
```

Записывать в лог: регистрация, вход, генерация, создание/удаление команды, бан/разбан.

**Файлы фазы 3:** ~3 файла изменить, ~1 новый  
**Результат:** Полная админ-панель для управления платформой.

---

### Фаза 4: Инфраструктура

#### 4.1 PostgreSQL для production

- `asyncpg` в requirements.txt (SQLite остаётся для dev)
- Конфиг через `DATABASE_URL`:
  - dev: `sqlite+aiosqlite:///./data/scenarioforge.db`
  - prod: `postgresql+asyncpg://user:pass@host/scenarioforge`
- `docker-compose.yml`: PostgreSQL + backend + frontend

#### 4.2 Безопасность

- CORS: убрать `allow_origins=["*"]`, задать конкретные домены
- JWT secret: проверка на `dev-secret-change-me` при AUTH_ENABLED=true
- Rate limiting: `slowapi` на auth-эндпоинтах (5 попыток/мин на login)
- Input validation: максимальная длина idea, equipment fields

#### 4.3 Тесты

- Auth: 401 без токена, 403 чужой проект
- Teams: owner может всё, editor не может менять роли, viewer не может редактировать
- Credits: списание с юзера vs команды, отказ при нулевом балансе
- Изоляция: User A не видит проекты User B
- Миграции: Alembic upgrade/downgrade

---

## Порядок реализации

```
Фаза 1.1  Изоляция проектов (backend)         ✅
Фаза 1.2  Enforce tier-лимитов (backend)       ✅
Фаза 1.3  Auth UI (frontend)                   ✅
Фаза 1.4  Validate invite code endpoint        ✅
Фаза 1.5  Alembic                              ✅
─── Фаза 1: аутентификация работает ✅ ───

Фаза 2.1  Модели команд (backend)              ✅
Фаза 2.2  Team API (backend)                   ✅
Фаза 2.3  Обновление проектных эндпоинтов      ✅
Фаза 2.4  Team UI (frontend)                   ✅
─── Фаза 2: команды работают ✅ ───

Фаза 3.1  Расширение admin API              ✅
Фаза 3.2  Расширение Admin.tsx              ✅
Фаза 3.3  Аудит-лог                        ✅
─── Фаза 3: админ-панель полная ✅ ───

Фаза 4.1  PostgreSQL
Фаза 4.2  Безопасность
Фаза 4.3  Тесты
─── Фаза 4: production-ready ───
```

## Количество файлов по фазам

| Фаза | Изменения | Новые файлы | Ориентировочно |
|------|-----------|-------------|----------------|
| 1    | 8         | 5           | 1-2 сессии     |
| 2    | 6         | 5           | 1-2 сессии     |
| 3    | 3         | 1           | 1 сессия       |
| 4    | 4         | 3           | 1 сессия       |

## Проверка (Definition of Done)

### Фаза 1 ✅ (выполнено 2026-05-04)
- [x] `AUTH_ENABLED=false` → приложение работает как v1 (без регистрации)
- [x] `AUTH_ENABLED=true` → без инвайт-кода зарегистрироваться нельзя
- [x] Регистрация: код → email + пароль → автоматический вход
- [x] User A не видит проекты User B
- [x] Free tier: только fast mode, 5 генераций/месяц
- [x] При 0 кредитов → 403 на генерацию
- [x] Token refresh работает (15 мин access, 7 дней refresh)

### Фаза 2 ✅ (выполнено 2026-05-04)
- [x] Создание команды → создатель = owner
- [x] Owner приглашает по email → участник видит проекты команды
- [x] Viewer не может создавать/редактировать проекты
- [x] Editor создаёт проект → виден всем в команде
- [x] Генерация в команде → списывается с командного баланса
- [x] Пользователь в 2+ командах → переключатель работает

### Фаза 3 ✅ (выполнено 2026-05-04)
- [x] Админ видит всех пользователей, команды, коды
- [x] Бан пользователя → он не может войти
- [x] Изменение кредитов юзера/команды через админку
- [x] Аудит-лог показывает последние действия

### Фаза 4
- [ ] PostgreSQL через docker-compose работает
- [ ] Alembic миграции: upgrade + downgrade
- [ ] Тесты покрывают auth, teams, credits, isolation
- [ ] Rate limiting на login (5/мин)
