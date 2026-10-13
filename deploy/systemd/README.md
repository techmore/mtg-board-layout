# systemd units (SER8)

Install as user services (lingering must be on: `loginctl enable-linger $USER`):

```sh
npm ci && npm --prefix server ci
VITE_COLYSEUS_URL=ws://10.20.0.117:2567 npm run build
mkdir -p ~/.config/systemd/user && cp deploy/systemd/*.service ~/.config/systemd/user/
systemctl --user daemon-reload
systemctl --user enable --now mtg-board-server mtg-board-web
```

After pulling new code: rebuild the web app (the `npm run build` line) and `systemctl --user restart mtg-board-server mtg-board-web`. The room server runs from TypeScript source via tsx, so it needs no build step.
Web: http://10.20.0.117:4173 — room server: ws://10.20.0.117:2567. `vite preview` is a plain static server: fine on a LAN, put it behind a TLS proxy for anything public.
