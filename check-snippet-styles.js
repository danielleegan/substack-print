// Run this in Safari console to check snippet styles
const snippets = document.querySelectorAll('.article-snippet');
snippets.forEach((s, i) => {
  const style = getComputedStyle(s);
  console.log(`Snippet ${i + 1} styles:`, {
    height: style.height,
    minHeight: style.minHeight,
    maxHeight: style.maxHeight,
    overflow: style.overflow,
    overflowY: style.overflowY,
    position: style.position,
    zIndex: style.zIndex,
    clip: style.clip,
    clipPath: style.clipPath,
    transform: style.transform,
    opacity: style.opacity,
    display: style.display,
    visibility: style.visibility
  });
  
  // Check parent
  const parent = s.parentElement;
  if (parent) {
    const parentStyle = getComputedStyle(parent);
    console.log(`Snippet ${i + 1} parent styles:`, {
    className: parent.className,
    height: parentStyle.height,
    overflow: parentStyle.overflow,
    display: parentStyle.display
  });
  }
});
