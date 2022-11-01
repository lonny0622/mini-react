


/****************************************** CREATE ELEMENT ****************************************************** */

/**
 * 实现createElement
 * @param {string} type 元素的type 如dev
 * @param {any} props 元素所包含的属性
 * @param  {...any} children 子元素
 * @returns 
 */
function createElement(type, props, ...children) {
  return {
    type,
    props: {
      ...props,
      children: children.map(child =>
        //有时候我们的子元素是纯文本的/数字的，这时候我们就要优化一下
        //注意:React 对于一个基本值的子元素，不会创建空数组也不会包一层 TEXT_ELEMENT，
        //但是为了简化代码，我们的实现和 React 有差异，
        //毕竟在这里我们只想要简单的代码而不是完美的代码
        typeof child === "object" ? child : createTextElement(child)
      )
    }
  };
}

function createTextElement(text) {
  return {
    type: "TEXT_ELEMENT",
    props: {
      nodeValue: text,
      children: []
    }
  };
}

function createDom(fiber) {
  const dom =
    fiber.type == "TEXT_ELEMENT"
      ? document.createTextNode("")
      : document.createElement(fiber.type);

  updateDom(dom, {}, fiber.props);

  return dom;
}
/****************************************************RANDER**************************************************************** */
//比较特殊的属性值是事件监听，如果属性值以 “on” 作为前缀，我们需要以不同的方式来处理这个属性
const isEvent = key => key.startsWith("on");
//判断是否为事件或子元素外的属性
const isProperty = key => key !== "children" && !isEvent(key);
//判断是否为属性是否更新
const isNew = (prev, next) => key => prev[key] !== next[key];
//判断属性是否删除
const isGone = (prev, next) => key => !(key in next);
/**
 * 比较新老 fiber 节点的属性， 移除、新增或修改对应属性。
 * @param  dom 
 * @param  prevProps 
 * @param  nextProps 
 */
function updateDom(dom, prevProps, nextProps) {
  //对应的监听事件如果改变了，我们就需要移除或修改旧的事件监听属性
  Object.keys(prevProps)
    .filter(isEvent)
    .filter(key => !(key in nextProps) || isNew(prevProps, nextProps)(key))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.removeEventListener(eventType, prevProps[name]);
    });

  // 移除旧的元素的属性
  Object.keys(prevProps)
    .filter(isProperty)
    .filter(isGone(prevProps, nextProps))
    .forEach(name => {
      dom[name] = "";
    });

  // 设置新的或者修改之前的属性
  Object.keys(nextProps)
    .filter(isProperty)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      dom[name] = nextProps[name];
    });

  // 添加事件监听属性
  Object.keys(nextProps)
    .filter(isEvent)
    .filter(isNew(prevProps, nextProps))
    .forEach(name => {
      const eventType = name.toLowerCase().substring(2);
      dom.addEventListener(eventType, nextProps[name]);
    });
}
/**
 * 用于提交所有节点到dom上
 */
function commitRoot() {
  deletions.forEach(commitWork);
  commitWork(wipRoot.child);
  currentRoot = wipRoot;
  wipRoot = null;
}
/**
 * 提交任务
 * @param  fiber 
 * @returns 
 */
function commitWork(fiber) {
  if (!fiber) {
    return;
  }
  //找 DOM 节点的父节点时,我们需要向遍历 fiber 节点，直到找到有 DOM 节点的 fiber 节点。
  let domParentFiber = fiber.parent;
  while (!domParentFiber.dom) {
    domParentFiber = domParentFiber.parent;
  }
  const domParent = domParentFiber.dom;
  // 如果 fiber 节点有我们之前打上的 PLACEMENT 标，那么在其父 fiber 节点的 DOM 节点上添加该 fiber 的 DOM。
  if (fiber.effectTag === "PLACEMENT" && fiber.dom != null) {
    domParent.appendChild(fiber.dom);
    
  } else if (fiber.effectTag === "UPDATE" && fiber.dom != null) {
    updateDom(fiber.dom, fiber.alternate.props, fiber.props);
  //相反地，如果是 DELETION 标记，我们移除该子节点。
  } else if (fiber.effectTag === "DELETION") {
    commitDeletion(fiber, domParent);
  }

  commitWork(fiber.child);
  commitWork(fiber.sibling);
}

/**
 * 提交需要删除的节点
 * @param {*} fiber 
 * @param {*} domParent 
 */
function commitDeletion(fiber, domParent) {
  if (fiber.dom) {
    domParent.removeChild(fiber.dom);
  } else {
    //移除节点也同样需要找到该 fiber 下第一个有 DOM 节点的 fiber 节点。
    commitDeletion(fiber.child, domParent);
  }
}
/**
 * 实现render函数
 * 将createElement生成的对象转换成DOM元素
 * @param {object} element 需要被成dom的element对象
 * @param {object} container 容器，用来承载渲染出来的DOM
 */
function render(element, container) {
  //收集起来，完成后再统一渲染
  wipRoot = {
    dom: container,
    props: {
      children: [element]
    },
    //在每一个 fiber 节点上添加 alternate 属性用于记录旧 fiber 节点（上一个 commit 阶段使用的 fiber 节点）的引用。
    alternate: currentRoot
  };
  deletions = [];
  //render 函数中我们把 nextUnitOfWork 置为 fiber 树的根节点。
  nextUnitOfWork = wipRoot;
}

/*********************************************FIBER*************************************************** */
// 用于时间分片，指定下一个任务
let nextUnitOfWork = null;
// 保存"上次提交到 DOM 节点的 fiber 树" 的"引用"（reference）。
let currentRoot = null;
// 用来追踪并暂存fiber tree上DOM节点的修改，当更新完成后统一提交，避免用户看到渲染未完全的 UI
let wipRoot = null;
// 用于保存要移除的 dom 节点。
let deletions = null;

/**
 * 实现fiber
 * 将整个任务分成一些小块，每当我们完成其中一块之后需要把控制权交给浏览器，
 * 让浏览器判断是否有更高优先级的任务需要完成
 * 当浏览器有空闲的时候，会调用 workLoop 我们就开始遍历整颗fiber树。
 * @param  deadline 
 */
function workLoop(deadline) {
  let shouldYield = false;
  //当有下一个任务并且允许继续执行时
  while (nextUnitOfWork && !shouldYield) {
    //执行当前任务并返回下一个任务
    nextUnitOfWork = performUnitOfWork(nextUnitOfWork);
    /* requestIdleCallback 还给了我们一个 deadline 参数。
     * 我们可以通过它来判断离浏览器再次拿回控制权还有多少时间，
     * 当时间小于1ms时立即进行下一步
     */
    shouldYield = deadline.timeRemaining() < 1;
  }

  if (!nextUnitOfWork && wipRoot) {
    commitRoot();
  }
  /**
   * 使用requestIdleCallback来实现，requestIdleCallback 
   * 类似于setTimeout,不过区别是它是有浏览器决定何时运行的而不是
   * 我们指定的时间后，浏览器会在主线程有空闲的时候运行回调函数
   */
  requestIdleCallback(workLoop);
}
//启动任务循环
requestIdleCallback(workLoop);

/**
 * 我们需要先设置渲染的第一个任务单元，然后开始循环。
 * performUnitOfWork 函数不仅需要执行每一小块的任务单元，
 * 还需要返回下一个任务单元。
 */
function performUnitOfWork(fiber) {
  const isFunctionComponent = fiber.type instanceof Function;
  if (isFunctionComponent) {
    //更新函数组件
    updateFunctionComponent(fiber);
  } else {
    //更新类组件
    updateHostComponent(fiber);
  }
  if (fiber.child) {
    return fiber.child;
  }
  let nextFiber = fiber;
  while (nextFiber) {
    if (nextFiber.sibling) {
      return nextFiber.sibling;
    }
    nextFiber = nextFiber.parent;
  }
}

/****************************************FUNCTION COMPONENT AND HOOKS******************************************************** */
// work in progress fiber
let wipFiber = null;
// 表示这是该组件的第几个useState
let hookIndex = null;

/**
 * 用于从函数组件中生成子组件。
 * @param fiber 
 */
function updateFunctionComponent(fiber) {
  wipFiber = fiber;
  hookIndex = 0;
  //在对应的fiber上加上hooks数组以支持我们在同一个函数组件中多次调用 useState
  wipFiber.hooks = [];
  const children = [fiber.type(fiber.props)];
  reconcileChildren(fiber, children);
}

/**
 * 实现useState钩子
 * @param  initial 
 * @returns 
 */
function useState(initial) {
  /**
   * 当组件调用useState时我们要判断是否存在旧的值，这里我们用数组的下标表示这是该组件的第几个useState
   * 如果存在旧的hook这使用旧的，否则我们将它初始化，这是为了保证我们修改state后每次重新渲染state的值，保持为我们修改后的值，而不被初始化
   */
  const oldHook =
    wipFiber.alternate &&
    wipFiber.alternate.hooks &&
    wipFiber.alternate.hooks[hookIndex];
  const hook = {
    state: oldHook ? oldHook.state : initial,
    queue: []
  };
  //下一轮渲染时统一更新state,提升性能
  const actions = oldHook ? oldHook.queue : [];
  actions.forEach(action => {
    hook.state = action(hook.state);
  });
  // useState 还需要返回一个可以更新状态的函数，我们定义 setState，它接收一个 action参数。
  const setState = action => {
    //将 action 推入刚才添加的 hook 里的队列。
    hook.queue.push(action);
    //和之前在 render 函数中做的一样，我们将 wipRoot 设置为当前 fiber，之后我们的调度器会帮我们开始新一轮的渲染的。
    wipRoot = {
      dom: currentRoot.dom,
      props: currentRoot.props,
      alternate: currentRoot
    };
    nextUnitOfWork = wipRoot;
    deletions = [];
  };
  // 然后在 fiber 上添加新 hook，自增 hook 序号，返回状态。
  wipFiber.hooks.push(hook);
  hookIndex++;
  return [hook.state, setState];
}
/*******************************************************RECONCILE***************************************************************/
/**
 * 更新类组件
 */
function updateHostComponent(fiber) {
  if (!fiber.dom) {
    fiber.dom = createDom(fiber);
  }
  reconcileChildren(fiber, fiber.props.children);
}
/**
 * 调和（reconcile）旧的 fiber 节点 和新的 react elements。
 * @param  wipFiber 
 * @param  elements 
 */
function reconcileChildren(wipFiber, elements) {
  let index = 0;
  
  let oldFiber = wipFiber.alternate && wipFiber.alternate.child;
  let prevSibling = null;

  // 创建fiber
  while (index < elements.length || oldFiber != null) {
    // oldFiber 是我们上次渲染 fiber 树.
    // element 是我们想要渲染到 DOM 上的东西
    const element = elements[index];
    let newFiber = null;
    // 判断类型是否相同
    const sameType = oldFiber && element && element.type == oldFiber.type;
    // 对于新旧节点类型是相同的情况，我们可以复用旧的 DOM，仅修改上面的属性
    if (sameType) {
      //当新的 element 和旧的 fiber 类型相同, 我们对 element 创建新的 fiber 节点，并且复用旧的 DOM 节点，但是使用 element 上的 props。
      //我们需要在生成的fiber上添加新的属性：effectTag。在 commit 阶段（commit phase）会用到它。
      newFiber = {
        type: oldFiber.type,
        props: element.props,
        dom: oldFiber.dom,
        parent: wipFiber,
        alternate: oldFiber,
        effectTag: "UPDATE"
      };
    }
    // 如果类型不同，意味着我们需要创建一个新的 DOM 节点
    if (element && !sameType) {
      newFiber = {
        type: element.type,
        props: element.props,
        dom: null,
        parent: wipFiber,
        alternate: null,
        // 对于需要生成新 DOM 节点的 fiber，我们需要标记其为 PLACEMENT。
        effectTag: "PLACEMENT"
      };
    }
    // 如果类型不同，并且旧节点存在的话，需要把旧节点的 DOM 给移除
    if (oldFiber && !sameType) {
      // 对于需要删除的节点，我们并不会去生成 fiber，因此我们在旧的fiber上添加标记。
      // 但是当我们提交（commit）整颗 fiber 树（wipRoot）的变更到 DOM 上的时候，并不会遍历旧 fiber。
      oldFiber.effectTag = "DELETION";
      // 因此我们需要一个数组去保存要移除的 dom 节点。
      // 之后我们提交变更到 DOM 上的时候，也需要把这个数组中的 fiber 的变更（其实是移除 DOM）给提交上去。
      deletions.push(oldFiber);
    }

    if (oldFiber) {
      oldFiber = oldFiber.sibling;
    }

    if (index === 0) {
      wipFiber.child = newFiber;
    } else if (element) {
      prevSibling.sibling = newFiber;
    }

    prevSibling = newFiber;
    index++;
  }
}

export const Didact = {
  createElement,
  render,
  useState
};
