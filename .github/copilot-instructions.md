# AiChat - AI Development Guide

## Architecture Overview

**AiChat** is a cross-platform AI chat application built with Svelte + Tauri:
- **Backend (Rust)**: Tauri commands, database operations (SQLite), storage management
- **Frontend (Svelte 5)**: Reactive UI using runes ($state, $effect, $derived)
- **Communication**: Tauri commands (invoke) for backend operations
- **State Management**: Svelte 5 runes-based stores (class-based with singleton pattern)

**Key Data Flow**: Frontend stores invoke Rust commands → Rust performs database/storage operations → Returns data → Frontend updates reactive state

**Version Management**: Version specified in `Cargo.toml` (0.4.1) and `package.json` (0.2.0)

## Project Structure

```
src-tauri/          # Rust backend
  src/
    main.rs         # Entry point
    lib.rs          # Tauri commands registration
    commands.rs     # Tauri command implementations
    memory_db.rs    # SQLite memory database operations
    storage.rs      # File storage utilities
    memory_schema.sql # Database schema
src/                # Svelte 5 frontend
  App.svelte        # Main app component
  main.js           # App initialization
  pages/            # Page components (ChatPage, ContactsPage, MomentsPage)
  lib/
    api/            # API clients (anthropic, openai, gemini, deepseek, etc.)
    components/     # Reusable UI components
    stores/         # Svelte 5 runes state management ($state, $effect)
      app-settings.svelte.js  # App settings state
      chat.svelte.js          # Chat state
      contacts.svelte.js      # Contacts management
      persona.svelte.js       # Persona/character management
      preset.svelte.js        # Chat presets
      memory-*.svelte.js      # Memory system stores
      worldinfo.svelte.js     # World info entries
    memory/         # Memory system utilities
    utils/          # Utility functions (logger, parser, tauri helpers, etc.)
```

## Critical Development Workflows

### Development Mode
```bash
pnpm dev           # Starts Vite dev server only (no Tauri)
pnpm tauri:dev     # Starts Vite dev server + Tauri window
```
- Frontend uses **Vite 6** with Svelte 5 plugin
- Backend recompiles on Rust file changes
- Console shows both Rust stdout and frontend Vite logs
- **HMR**: Hot module reload via Vite

### Linting & Formatting
```bash
pnpm lint          # ESLint for JavaScript/Svelte
pnpm lint:fix      # Auto-fix ESLint issues
pnpm lint:rust     # Clippy for Rust
pnpm lint:rust:fix # Auto-fix Clippy issues
pnpm format        # Prettier for all files
pnpm format:check  # Check formatting without changes
pnpm format:rust   # Rustfmt for Rust code
pnpm format:rust:check  # Check Rust formatting
```

### Building
```bash
pnpm install       # Install frontend dependencies (requires pnpm 9, Node 22)
pnpm build         # Build frontend only (Vite)
pnpm tauri:build   # Build full Tauri application (all platforms)
```

### Testing
```bash
pnpm test          # Run Vitest tests
pnpm test:ui       # Run Vitest with UI
pnpm check         # Svelte type checking
```

### CI/CD
- Lint workflow: Auto-formats and commits changes on push
- Test workflow: Runs tests and builds on multiple platforms
- CodeQL: Security analysis
- Dependabot: Automated dependency updates

## Project-Specific Patterns & Conventions

### Tauri Command Pattern
Commands follow this structure:
```rust
#[tauri::command]
async fn command_name(
    param: Type,
) -> Result<ReturnType, String> {
    // ... async logic
    Ok(result)
}
```
**Register in `lib.rs`:**
```rust
tauri::Builder::default()
    .invoke_handler(tauri::generate_handler![command_name, ...])
```

### Event Communication
**Frontend → Rust (Commands):**
```typescript
import { invoke } from "@tauri-apps/api/core";
const result = await invoke("command_name", { param: value });
```

### State Management (Svelte 5)
Uses **Svelte 5 runes** (not stores):
```typescript
// stores/*.svelte.js
export class SomeState {
  data = $state<Type | null>(null);  // Reactive state
  isLoginModalOpen = $state(false);
  
  $effect(() => {  // Side effects
    // Runs when dependencies change
  });
}
// Export singleton
export const authState = new AuthState();
```
**CRITICAL**: Stores are TypeScript classes with `$state` runes, not Svelte 4's `writable()`. Each store file exports a singleton instance.

**Store Pattern**: 
- File: `stores/*.svelte.ts` (note `.svelte.ts` extension)
- Class-based with reactive `$state` properties
- Methods for actions (async operations with `invoke()`)
- Derived values with `get` accessors
- Side effects with `$effect()` (auto-tracks dependencies)

### Version Inheritance System
Modded versions (Fabric/Forge) use `inheritsFrom` field:
- [`version_merge.rs`](../src-tauri/src/core/version_merge.rs): Merges parent vanilla JSON with mod loader JSON
- [`manifest.rs`](../src-tauri/src/core/manifest.rs): `load_version()` recursively resolves inheritance
- Libraries, assets, arguments are merged from parent + modded version

### Microsoft Authentication Flow
Uses **Device Code Flow** (no redirect needed):
1. Frontend calls `start_microsoft_login()` → gets device code + URL
2. User visits URL in browser, enters code
3. Frontend polls `complete_microsoft_login()` with device code
4. Rust exchanges code → MS token → Xbox Live → XSTS → Minecraft token
5. Stores MS refresh token for auto-refresh (see [`auth.rs`](../src-tauri/src/core/auth.rs))

**Client ID**: Uses ATLauncher's public client ID (`c36a9fb6-4f2a-41ff-90bd-ae7cc92031eb`)

### Download System
[`downloader.rs`](../src-tauri/src/core/downloader.rs) features:
- **Concurrent downloads** with semaphore (configurable threads)
- **Resumable downloads**: `.part` + `.part.meta` files track progress
- **Multi-segment downloads**: Large files split into segments downloaded in parallel
- **Checksum verification**: SHA1/SHA256 validation
- **Progress events**: Emits `download-progress` with file name, bytes, ETA
- **Queue persistence**: Java downloads saved to `download_queue.json` for resumption

### Java Management
[`java.rs`](../src-tauri/src/core/java.rs):
- **Auto-detection**: Scans `/usr/lib/jvm`, `/Library/Java`, `JAVA_HOME`, `PATH`
- **Adoptium API**: Fetches available JDK/JRE versions for current OS/arch
- **Catalog caching**: `java_catalog.json` cached for 24 hours
- **Installation**: Downloads, extracts to `app_data_dir/java/<version>`
- **Cancellation**: Global `AtomicBool` flag for download cancellation

### Error Handling
- Commands return `Result<T, String>` (String for JS-friendly errors)
- Use `.map_err(|e| e.to_string())` to convert errors
- Emit detailed error logs: `emit_log!(window, format!("Error: {}", e))`

### File Paths
- **Game directory**: `app_handle.path().app_data_dir()` (~/.local/share/com.dropout.launcher on Linux)
- **Versions**: `game_dir/versions/<version_id>/<version_id>.json`
- **Libraries**: `game_dir/libraries/<maven-path>`
- **Assets**: `game_dir/assets/objects/<hash[0..2]>/<hash>`
- **Config**: `game_dir/config.json`
- **Accounts**: `game_dir/accounts.json`

## Integration Points

### External APIs
- **Mojang**: `https://piston-meta.mojang.com/mc/game/version_manifest_v2.json`
- **Fabric Meta**: `https://meta.fabricmc.net/v2/`
- **Forge Maven**: `https://maven.minecraftforge.net/`
- **Adoptium**: `https://api.adoptium.net/v3/`
- **GitHub Releases**: `https://api.github.com/repos/HsiangNianian/DropOut/releases`

### Native Dependencies
- **Linux**: `libwebkit2gtk-4.1-dev`, `libgtk-3-dev` (see [test.yml](../.github/workflows/test.yml))
- **macOS**: System WebKit via Tauri
- **Windows**: WebView2 runtime (bundled)

## Common Tasks

### Adding a New Tauri Command
1. Define function in [`main.rs`](../src-tauri/src/main.rs) with `#[tauri::command]`
2. Add to `.invoke_handler(tauri::generate_handler![..., new_command])`
3. Call from frontend: `invoke("new_command", { args })`

### Adding a New UI View
1. Create component in `ui/src/components/NewView.svelte`
2. Import in [`App.svelte`](../ui/src/App.svelte)
3. Add navigation in [`Sidebar.svelte`](../ui/src/components/Sidebar.svelte)
4. Update `uiState.activeView` in [`ui.svelte.ts`](../ui/src/stores/ui.svelte.ts)

### Emitting Progress Events
Use `emit_log!` macro for launcher logs:
```rust
emit_log!(window, format!("Downloading {}", filename));
```
For custom events:
```rust
window.emit("custom-event", payload)?;
```

## Important Notes

- **Svelte 5 syntax**: Use `$state`, `$derived`, `$effect` (not `writable` stores)
- **Store files**: Must have `.svelte.js` extension, not `.ts`
- **Frontend dependencies**: Must use pnpm 9 + Node 22
- **No emoji characters**: Project uses text-only UI elements for professional appearance

## Debugging Tips

- **Rust logs**: Check terminal running `pnpm tauri:dev`
- **Frontend logs**: Browser devtools (Ctrl+Shift+I in Tauri window)
- **Database issues**: Check SQLite operations in `memory_db.rs`
- **API issues**: Check network requests in browser devtools

## Version Compatibility

- **Rust**: Edition 2021, requires Tauri v2 dependencies
- **Node.js**: 22+ with pnpm 9+ for frontend
- **Tauri**: v2.0+
- **Svelte**: v5.0+ (runes mode)

## Commit Conventions

Follow instructions in [`.github/instructions/commit.instructions.md`](.github/instructions/commit.instructions.md):
- **Format**: `<type>[scope]: <description>` (lowercase, imperative, no period)
- **AI commits**: MUST include `Reviewed-by: [MODEL_NAME]`
- **Common types**: `feat`, `fix`, `docs`, `refactor`, `perf`, `test`, `chore`
- **Language**: Commit messages ALWAYS in English
- **Confirmation**: ALWAYS ask before committing (unless "commit directly" requested)
- See [Conventional Commits spec](.github/references/git/conventional-commit.md) for details

