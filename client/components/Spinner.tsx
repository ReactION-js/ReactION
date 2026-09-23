import styled, { keyframes } from "styled-components";

const spin = keyframes`
  to {
    transform: rotate(360deg);
  }
`;

const Ring = styled.div<{ $theme: "light" | "dark" }>`
  width: 16px;
  height: 16px;
  flex: 0 0 auto;
  border-radius: 50%;
  border: 2px solid
    ${(props) => (props.$theme === "light" ? "rgba(0, 0, 0, 0.15)" : "rgba(255, 255, 255, 0.15)")};
  border-top-color: ${(props) => (props.$theme === "light" ? "#181818" : "#f8f8f8")};
  animation: ${spin} 0.8s linear infinite;
`;

// Small theme-aware spinner for any "please wait" state (static analysis
// running, live connection in progress) -- a plain static line of text for
// something that can take several seconds reads as stalled/broken rather
// than working.
export default function Spinner({ theme }: { theme: "light" | "dark" }) {
  return <Ring $theme={theme} role="status" aria-label="Loading" />;
}
