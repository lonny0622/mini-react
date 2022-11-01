import { Didact } from "./Didact";

//经典的计数组件。每点击一次，状态自增一。
/** @jsx Didact.createElement */
function Counter() {
  const [state, setState] = Didact.useState(1);
  return (
    <h1 onClick={() => setState(c => c + 1)} style="user-select: none">
      Count: {state}
    </h1>
  );
}
const element = <Counter />;
const container = document.getElementById("root");
Didact.render(element, container);
