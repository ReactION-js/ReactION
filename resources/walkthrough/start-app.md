# Start your React app

ReactION visualizes a **running** React app. It drives a real Chrome instance
behind the scenes and injects the official React DevTools protocol, so your app
needs to be up in **development mode** first.

### 1. Run your dev server

In your project's terminal, start the app the way you normally do:

```bash
# Create React App / Next.js
npm start
# or
npm run dev

# Vite
npm run dev
```

### 2. Note the URL it prints

Your dev server will print the address it's serving on, for example:

- `http://localhost:3000` — Create React App, Next.js
- `http://localhost:5173` — Vite
- `http://localhost:8080` — webpack-dev-server

You'll use this URL in the next step.

> **Development mode matters.** Production builds strip the hook the React
> DevTools protocol relies on. If you point ReactION at a production build, the
> graph will stay empty.
