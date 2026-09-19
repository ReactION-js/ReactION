// Phase 0 spike sample app. Deliberately exercises a spread of component types
// (function, memo, forwardRef, class, context provider/consumer, list children)
// so the DevTools Store has something varied to report. Bundled by esbuild.
import {
  StrictMode,
  createContext,
  useContext,
  useState,
  useEffect,
  memo,
  forwardRef,
  Component,
} from "react";
import { createRoot } from "react-dom/client";

const ThemeContext = createContext("dark");

function Header() {
  const theme = useContext(ThemeContext);
  return <h1>ReactION spike — theme: {theme}</h1>;
}

const Counter = memo(function Counter({ count }) {
  return <div className="counter">Count: {count}</div>;
});

const FancyButton = forwardRef(function FancyButton({ children }, ref) {
  return <button ref={ref}>{children}</button>;
});

class Panel extends Component {
  render() {
    return <section className="panel">{this.props.children}</section>;
  }
}

function Item({ label }) {
  return <li>{label}</li>;
}

function App() {
  const [count, setCount] = useState(0);
  useEffect(() => {
    // Periodic commits so re-renders/commits are observable (heatmap groundwork).
    const id = setInterval(() => setCount((c) => c + 1), 800);
    return () => clearInterval(id);
  }, []);
  return (
    <ThemeContext.Provider value="dark">
      <Header />
      <Panel>
        <Counter count={count} />
        <FancyButton>Increment</FancyButton>
        <ul>
          {["alpha", "beta", "gamma"].map((label) => (
            <Item key={label} label={label} />
          ))}
        </ul>
      </Panel>
    </ThemeContext.Provider>
  );
}

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <App />
  </StrictMode>,
);
