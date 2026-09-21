# Troubleshooting & tips

Most first-run issues fall into one of these buckets. The **ReactION** output
channel (open it with the button on this step) logs the Chrome launch, the
DevTools relay, and webview activity — it's the first place to look.

### The graph is empty

- **Your app isn't running.** Start your dev server, then reopen the panel.
- **Wrong URL / port.** Re-run **ReactION: Configure Dev Server** so the URL
  matches your app.
- **Production build.** ReactION needs a **development** build — production
  builds strip the DevTools hook. Run your dev command (`npm run dev` /
  `npm start`), not a built/preview server.
- **No React root has mounted yet** at that URL. Give a slow first compile a
  moment, or navigate to the route that actually renders React.

### "Couldn't launch Chrome"

- Make sure **Google Chrome (or Chromium)** is installed.
- Re-run **ReactION: Configure Dev Server** and set the **Chrome location** when
  prompted, or fix `"executablePath"` in `reactION-config.json`.

### "Can't reach your dev server"

- Confirm the app is up and reachable in a normal browser at the same URL.
- If it runs on a non-standard port, update `"localhost"` via the setup wizard.

### It was working, then went blank

- If the dev server restarted, ReactION auto-reconnects. If the **Chrome window
  itself** closed or crashed, close and reopen the panel to relaunch it.

### Still stuck?

- Open the **ReactION** output channel and copy the log.
- File an issue at
  [github.com/ReactION-js/ReactION/issues](https://github.com/ReactION-js/ReactION/issues).
