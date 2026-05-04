# ScenarioForge v2 — Changelog

## Фаза 1: Аутентификация и изоляция проектов (2026-05-04)

### Backend
- **JWT Auth** (`backend/auth/`) — регистрация по инвайт-коду, логин, refresh токенов (15 мин access / 7 дней refresh)
- **Модели** (`backend/db/models.py`) — User, ProjectRecord, UsageRecord, InviteCode, CreditCode
- **Изоляция проектов** (`backend/main.py`) — `get_current_user` на всех проектных эндпоинтах, `_check_project_access` по user_id
- **Tier-лимиты** (`backend/services/usage.py`) — free: 5 генераций/мес + только fast; pro: без лимитов
- **Admin API** (`backend/admin/routes.py`) — CRUD юзеров, генерация инвайтов/кредитов, статистика
- **Валидация инвайт-кода** (`POST /api/auth/validate-code`)
- **Активация кредит-кода** (`POST /api/auth/redeem`)
- **Alembic** (`backend/alembic/`) — async миграции, первая миграция с начальной схемой

### Frontend
- **AuthContext** (`frontend/src/contexts/AuthContext.tsx`) — авторизация, refresh, logout
- **Login / Register** (`frontend/src/pages/`) — тёмный UI, двухшаговая регистрация (инвайт → данные)
- **ProtectedRoute** — редирект на /login если auth_enabled && !authenticated
- **Layout** — имя пользователя, кредиты, logout
- **API client** — interceptor с auto-refresh при 401

---

## Фаза 2: Команды / Workspaces (2026-05-04)

### Backend

#### Новые модели (`backend/db/models.py`)
- **Team** — id, name, slug (unique), credits, created_by, created_at
- **TeamMember** — team_id, user_id, role (owner/editor/viewer), joined_at
- **ProjectRecord.team_id** — FK на teams, nullable (null = личный проект)

#### Team API (`backend/teams/routes.py`) — новый файл
| Эндпоинт | Описание |
|----------|----------|
| `POST /api/teams` | Создать команду (создатель = owner) |
| `GET /api/teams` | Список команд текущего пользователя |
| `GET /api/teams/{slug}` | Информация + участники |
| `PATCH /api/teams/{slug}` | Переименовать (owner) |
| `DELETE /api/teams/{slug}` | Удалить (owner) |
| `POST /api/teams/{slug}/members` | Добавить участника по email (owner) |
| `PATCH /api/teams/{slug}/members/{user_id}` | Изменить роль (owner) |
| `DELETE /api/teams/{slug}/members/{user_id}` | Удалить участника (owner) |
| `POST /api/teams/{slug}/leave` | Покинуть команду (не owner) |
| `POST /api/teams/{slug}/transfer-credits` | Перевести личные кредиты в пул команды |
| `POST /api/teams/{slug}/redeem` | Активировать кредит-код на команду (owner) |

#### Обновления проектных эндпоинтов (`backend/main.py`)
- **`_check_project_access`** — двухуровневый: личный проект (user_id) → командный (TeamMember lookup), `require_edit` блокирует viewer
- **`POST /api/projects`** — принимает `team_slug`, проверяет membership + роль (owner/editor)
- **`GET /api/projects`** — без `?team=` возвращает личные + все командные; с `?team=slug` — только проекты команды
- **Мутирующие эндпоинты** (generate, revise, edit, delete, brief, chat) — `require_edit=True`
- **Кредиты при генерации** — списываются с Team.credits если проект командный, иначе с User.credits

#### Миграция
- `alembic/versions/cb8c1a0290fc_add_teams_and_team_members.py` — таблицы teams, team_members, колонка projects.team_id

### Frontend

#### Новые файлы
- **TeamContext** (`frontend/src/contexts/TeamContext.tsx`) — список команд, текущая выбранная, persist в localStorage
- **TeamSelector** (`frontend/src/components/TeamSelector.tsx`) — dropdown в header: "Личные" / "Команда X" / "Команда Y"
- **Teams** (`frontend/src/pages/Teams.tsx`) — список команд + создание новой
- **TeamSettings** (`frontend/src/pages/TeamSettings.tsx`) — настройки команды: переименование, участники (add/remove/change role), кредиты (перевод + активация кода), удаление

#### Обновлённые файлы
- **App.tsx** — `TeamProvider`, маршруты `/teams`, `/teams/:slug`
- **Layout.tsx** — `TeamSelector` в navbar, ссылка "Команды"
- **ProjectList.tsx** — фильтрация по `currentTeam?.slug`
- **NewProject.tsx** — передаёт `team_slug` при создании, показывает "Проект в команде X"
- **api/client.ts** — 12 новых методов для Team API, `listProjects(teamSlug?)`, `createProject({ team_slug })`
- **types/index.ts** — типы `Team`, `TeamDetail`, `TeamMemberInfo`

### Ролевая модель команд

| Действие | Owner | Editor | Viewer |
|----------|-------|--------|--------|
| Видеть проекты | + | + | + |
| Создавать проекты | + | + | - |
| Редактировать / генерировать | + | + | - |
| Удалять проекты | + | + | - |
| Приглашать участников | + | - | - |
| Менять роли | + | - | - |
| Удалять команду | + | - | - |
| Переводить кредиты | + | + | + |
| Активировать кредит-код на команду | + | - | - |

---

## Фаза 3: Расширение админ-панели (2026-05-04)

### Backend (`backend/admin/routes.py`)
- **Управление командами** — `GET /api/admin/teams`, `PATCH /api/admin/teams/{id}` (кредиты), `DELETE /api/admin/teams/{id}`
- **Лог активности** — `GET /api/admin/activity?limit=50&offset=0` (пагинация)
- **Аудит-трейл** — `AuditLog` записи на все значимые действия: login, register, generate, admin_update_user, admin_update_team, admin_delete_team, redeem_credit

### Frontend (`frontend/src/pages/Admin.tsx`)
- **Вкладка «Команды»** — таблица с редактированием кредитов и удалением
- **Вкладка «Активность»** — лог действий с пагинацией «Загрузить ещё»
- **Поиск юзеров** — фильтрация по email / имени
- **Статистика** — счётчик команд и токенов (input/output) в шапке

---

## Фаза 4: PostgreSQL, security hardening, тесты (2026-05-04)

### PostgreSQL
- **`backend/db/session.py`** — автоматический выбор драйвера: `asyncpg` для PostgreSQL, `aiosqlite` для SQLite
- **`backend/config.py`** — `database_url` по умолчанию SQLite, переключается на PostgreSQL через env `DATABASE_URL`
- **`docker-compose.yml`** — PostgreSQL 16-alpine с healthcheck, persistent volume

### Docker
- **Backend healthcheck** — `GET /api/config/models` с `start_period: 30s`
- **Frontend** — `depends_on: backend: condition: service_healthy` (ждёт backend)
- **Обязательные env** — `JWT_SECRET`, `TRINITY_API_KEY`, `ADMIN_PASSWORD` с `${VAR:?error}` (compose падает если не заданы)

### Alembic миграции
- `1883bb2a1cda_initial_schema.py` — users, project_records, invite_codes, credit_codes, usage_records
- `651c4b372d84_add_audit_log.py` — таблица audit_log
- `cb8c1a0290fc_add_teams_and_team_members.py` — teams, team_members, projects.team_id

### Тесты (`backend/tests/`)
| Файл | Кол-во | Что покрывает |
|------|--------|---------------|
| `test_agents.py` | 6 | Системные промпты, вызов LLM |
| `test_api.py` | 8 | CRUD проектов, экспорт, конфиг |
| `test_auth_endpoints.py` | 15 | Регистрация, логин, refresh, redeem, 401/403 |
| `test_auth_passwords.py` | 2 | Bcrypt > 72 символов, без warnings |
| `test_credits.py` | 6 | Перевод кредитов, redeem на команду/юзера, лимиты |
| `test_isolation.py` | 6 | Изоляция проектов, командный доступ |
| `test_pipeline.py` | 3 | Бриф, генерация (fast), стоп |
| `test_startup.py` | 1 | Импорт из рабочей директории |
| `test_teams_endpoints.py` | 7 | CRUD команд, роли, удаление |
| **Итого** | **56 passed** | |

---

## Финальный security-фикс (2026-05-04)

### Критические исправления
| Проблема | Файл | Решение |
|----------|------|---------|
| SSE stream без авторизации | `main.py:641` | `get_current_user` вместо `get_current_user_optional` |
| `/api/admin/migrate` без auth | `main.py:763` | Добавлена проверка `is_admin` |
| Path traversal через `agent_name` | `main.py:457` | Валидация `agent_name in AGENTS` |
| Блокирующий Alembic в async startup | `main.py:47` | `run_in_executor` |
| Race condition при списании кредитов | `main.py:335`, `teams/routes.py:362` | `SELECT ... FOR UPDATE` |
| Rate limiter за proxy видит IP контейнера | `auth/limiter.py` | `X-Forwarded-For` / `X-Real-IP` |
| `python-jose` deprecated `utcnow()` warnings | `auth/jwt.py`, `requirements.txt` | Замена на `PyJWT 2.9.0` |
| Нет audit log при redeem credits | `auth/routes.py` | Добавлен `AuditLog` + `commit()` |
| `JWT_SECRET` молча пустой в docker | `docker-compose.yml` | `${JWT_SECRET:?...}` |
| Нет предупреждения о дефолтном admin пароле | `main.py` | Startup warning |
| Нет healthcheck у backend | `docker-compose.yml` | HTTP healthcheck + frontend ждёт |

### Lint cleanup (frontend)
- `AuthContext.tsx` — устранён recursive self-call, fast-refresh warning, setState-in-effect
- `Admin.tsx` — удалён неиспользуемый `loadData`, инлайновый fetch в effect с cleanup
- `ProjectList.tsx` — `useCallback` для `fetchProjects`, добавлен в deps
