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
