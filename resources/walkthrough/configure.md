# Point ReactION at your dev server

ReactION needs to know **which URL** your app is running on so it matches the
app you're trying to test.

### Use the setup wizard

Run **ReactION: Configure Dev Server** (the button on this step). It will:

1. **Auto-detect** a running dev server on the common ports
   (3000, 5173, 8080, 4200, …).
2. Let you **confirm or type** the exact URL — e.g. `localhost:3000` or a full
   `https://…` address.
3. Make sure ReactION can **find Chrome** (it only asks if the browser isn't in
   the standard location).
4. Save everything to **`reactION-config.json`** in your workspace root.

### Prefer to edit by hand?

Open `reactION-config.json` and change `"localhost"`:

```json
{
  "localhost": "localhost:3000",
  "reactTheme": "dark",
  "headless_browser": false
}
```

Changes take effect the next time you launch — no window reload needed.
