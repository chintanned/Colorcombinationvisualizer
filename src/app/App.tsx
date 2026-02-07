import React from "react";
import { ThreeDPrinterViewer } from "@/app/components/ThreeDPrinterViewer";

export default function App() {
  return (
    <>
      <ThreeDPrinterViewer />
      <style>{`
        .transform-style-3d {
          transform-style: preserve-3d;
        }
        .backface-visible {
          backface-visibility: visible; /* We want to see inside faces for the box sometimes */
          /* Actually for a solid box we usually want hidden, but since we are building it with planes, visible is fine unless we have culling issues. 
             However, for the "Inner" box to be seen inside the "Outer" box, we rely on the gap and position. 
             Let's stick to standard behavior. */
        }
      `}</style>
    </>
  );
}
