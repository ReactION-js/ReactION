// Phase 4d fixture reproducing GitHub issue #72's exact dependency versions
// (react/react-dom 16.9.0, react-router-dom 5.0.1). MemoryRouter is used
// instead of BrowserRouter -- no real browser URL/navigation is needed for
// this harness, just react-router-dom@5's component types (Route/Switch/
// Link/NavLink), which relied on legacy context internals in v5 and were
// exactly the sort of tree the OLD fiber-walking approach could choke on.
import React from "react";
import ReactDOM from "react-dom";
import { MemoryRouter, Route, Switch, Link, NavLink } from "react-router-dom";

function Nav() {
  return (
    <nav>
      <NavLink to="/" exact activeClassName="active">
        Home
      </NavLink>
      <Link to="/about">About</Link>
      <Link to="/users">Users</Link>
    </nav>
  );
}

function Home() {
  return <h1>Home</h1>;
}

function UserDetails({ match }) {
  return <li>user: {match.params.id}</li>;
}

function Users() {
  return (
    <div>
      <h1>Users</h1>
      <ul>
        <UserDetails key="alice" match={{ params: { id: "alice" } }} />
        <UserDetails key="bob" match={{ params: { id: "bob" } }} />
      </ul>
    </div>
  );
}

function About() {
  return <h1>About</h1>;
}

function App() {
  // Start on /users so Users' nested component tree (Users -> two
  // UserDetails children) is actually mounted, not just declared -- Switch
  // only renders the one matching Route. UserDetails' `match` prop below is
  // hand-constructed, not produced by a real `:id` route param match, so
  // this exercises DevTools tree-walking through Switch/Route/Link/NavLink
  // and nested components, not react-router's param-matching machinery.
  return (
    <MemoryRouter initialEntries={["/users"]}>
      <Nav />
      <Switch>
        <Route exact path="/" component={Home} />
        <Route path="/about" component={About} />
        <Route path="/users" component={Users} />
      </Switch>
    </MemoryRouter>
  );
}

ReactDOM.render(<App />, document.getElementById("root"));
