import React, { useCallback, useImperativeHandle, forwardRef, useRef } from "react";
import {
  Tldraw,
  Editor,
  BaseBoxShapeUtil,
  HTMLContainer,
  TLBaseShape,
  useEditor,
  createShapeId,
} from "@tldraw/tldraw";
import { TerminalNode } from "./TerminalNode";

// Define the TLDraw custom shape interface for Terminal
export type ITerminalShape = TLBaseShape<
  "terminal",
  {
    w: number;
    h: number;
    terminalId: string;
    title: string;
  }
>;

// Custom TLDraw Shape Util
export class TerminalShapeUtil extends BaseBoxShapeUtil<ITerminalShape> {
  static override type = "terminal" as const;

  override getDefaultProps(): ITerminalShape["props"] {
    return {
      w: 640,
      h: 400,
      terminalId: "default",
      title: "Terminal",
    };
  }

  override component(shape: ITerminalShape) {
    const editor = useEditor();

    return (
      <HTMLContainer
        id={shape.id}
        style={{
          width: shape.props.w,
          height: shape.props.h,
          pointerEvents: "all",
        }}
      >
        <TerminalNode
          id={shape.props.terminalId}
          title={shape.props.title}
          onClose={() => {
            editor.deleteShapes([shape.id]);
          }}
        />
      </HTMLContainer>
    );
  }

  override indicator(shape: ITerminalShape) {
    return <rect width={shape.props.w} height={shape.props.h} rx={8} ry={8} />;
  }
}

const customShapeUtils = [TerminalShapeUtil];

export interface CanvasHandle {
  addTerminalNode: () => void;
}

export const Canvas = forwardRef<CanvasHandle, {}>((_, ref) => {
  const editorRef = useRef<Editor | null>(null);

  const handleMount = useCallback((editor: Editor) => {
    editorRef.current = editor;
  }, []);

  const addTerminalNode = useCallback(() => {
    if (!editorRef.current) return;

    const editor = editorRef.current;
    const { x, y } = editor.getViewportPageBounds().center;
    const id = `term-${Math.random().toString(36).substring(2, 9)}`;

    editor.createShape({
      id: createShapeId(),
      type: "terminal",
      x: x - 320,
      y: y - 200,
      props: {
        w: 640,
        h: 400,
        terminalId: id,
        title: `Terminal (${id.slice(5)})`,
      },
    });
  }, []);

  useImperativeHandle(ref, () => ({
    addTerminalNode,
  }));

  return (
    <div className="w-full h-full relative">
      <Tldraw
        shapeUtils={customShapeUtils}
        onMount={handleMount}
        inferDarkMode
      />
    </div>
  );
});

Canvas.displayName = "Canvas";
