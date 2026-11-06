import React, { useEffect, useRef } from "react";

export default function LogPanel({ lines }) {
  const ref = useRef(null);

  useEffect(() => {
    if (ref.current) ref.current.scrollTop = ref.current.scrollHeight;
  }, [lines]);

  return (
    <div className="log-panel" ref={ref}>
      {lines.map((line, i) => (
        <div className="log-line" key={i}>
          <span className="txt">{line}</span>
        </div>
      ))}
    </div>
  );
}
