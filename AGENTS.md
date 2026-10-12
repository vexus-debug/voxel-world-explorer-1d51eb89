<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- Game logic lives in src/game (world data/meshing/physics in world.ts, shared mutable state + HUD store in state.ts); the game route is ssr:false because WebGL and localStorage are browser-only.
- Keep TanStack development source annotations out of src/game, because React Three Fiber forwards DOM-style JSX attributes to Three.js objects and crashes on unknown properties.
