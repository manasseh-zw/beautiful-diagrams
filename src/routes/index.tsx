import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { createFileRoute } from "@tanstack/react-router"
import { Download } from "lucide-react"
import { basicSetup, EditorView } from "codemirror"
import { indentWithTab } from "@codemirror/commands"
import { EditorState } from "@codemirror/state"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { keymap, placeholder } from "@codemirror/view"
import {
  flowchartTags,
  ganttTags,
  journeyTags,
  mermaid,
  mermaidTags,
  pieTags,
  requirementTags,
  sequenceTags,
} from "codemirror-lang-mermaid"
import { tags as t } from "@lezer/highlight"
import { THEMES, renderMermaidSVG } from "beautiful-mermaid"
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch"

import { Button } from "@/components/ui/button"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

export const Route = createFileRoute("/")({ component: App })

const INITIAL_CODE = ""
const DEFAULT_THEME = "github-light"
const THEME_NAMES = [
  DEFAULT_THEME,
  ...Object.keys(THEMES).filter((themeName) => themeName !== DEFAULT_THEME),
]
const CANVAS_PADDING = 10
const CANVAS_FIT_RATIO = 0.995
const CANVAS_TOP_BIAS = 56
const EDITOR_PLACEHOLDER = `Paste Mermaid here...

flowchart LR
  A[Start] --> B[Finish]`

const mermaidHighlightStyle = HighlightStyle.define([
  {
    tag: [
      t.typeName,
      mermaidTags.diagramName,
      flowchartTags.diagramName,
      sequenceTags.diagramName,
      journeyTags.diagramName,
      requirementTags.diagramName,
      pieTags.diagramName,
      ganttTags.diagramName,
    ],
    color: "#0550ae",
    fontWeight: "600",
  },
  {
    tag: [
      t.keyword,
      flowchartTags.keyword,
      flowchartTags.orientation,
      sequenceTags.keyword1,
      sequenceTags.keyword2,
      journeyTags.keyword,
      requirementTags.keyword,
      pieTags.title,
      pieTags.showData,
      ganttTags.keyword,
    ],
    color: "#8250df",
  },
  {
    tag: [
      t.comment,
      t.lineComment,
      flowchartTags.lineComment,
      sequenceTags.lineComment,
      journeyTags.lineComment,
      requirementTags.lineComment,
      pieTags.lineComment,
      ganttTags.lineComment,
    ],
    color: "#6e7781",
    fontStyle: "italic",
  },
  {
    tag: [
      t.string,
      flowchartTags.string,
      pieTags.string,
      pieTags.titleText,
      ganttTags.string,
      requirementTags.quotedString,
    ],
    color: "#0a3069",
  },
  {
    tag: [
      t.number,
      flowchartTags.number,
      pieTags.number,
      journeyTags.score,
      requirementTags.number,
    ],
    color: "#953800",
  },
  {
    tag: [
      flowchartTags.nodeEdge,
      flowchartTags.link,
      sequenceTags.arrow,
      requirementTags.arrow,
    ],
    color: "#1f6feb",
  },
  {
    tag: [
      flowchartTags.nodeId,
      flowchartTags.nodeText,
      flowchartTags.nodeEdgeText,
      sequenceTags.nodeText,
      sequenceTags.messageText1,
      sequenceTags.messageText2,
      journeyTags.actor,
      journeyTags.text,
      requirementTags.unquotedString,
    ],
    color: "#24292f",
  },
])

const mermaidEditorTheme = EditorView.theme({
  "&": {
    height: "100%",
    backgroundColor: "transparent",
    color: "var(--foreground)",
    fontFamily:
      '"Cascadia Mono", "Cascadia Code", "SFMono-Regular", ui-monospace, monospace',
    fontSize: "13px",
  },
  "&.cm-focused": {
    outline: "none",
  },
  ".cm-scroller": {
    overflow: "auto",
    fontFamily:
      '"Cascadia Mono", "Cascadia Code", "SFMono-Regular", ui-monospace, monospace',
    lineHeight: "1.75",
  },
  ".cm-content, .cm-gutter": {
    minHeight: "100%",
    padding: "20px",
  },
  ".cm-content": {
    caretColor: "var(--foreground)",
  },
  ".cm-line": {
    padding: "0",
  },
  ".cm-gutters": {
    display: "none",
  },
  ".cm-activeLine, .cm-activeLineGutter": {
    backgroundColor: "transparent",
  },
  ".cm-selectionBackground, &.cm-focused .cm-selectionBackground, ::selection":
    {
      backgroundColor:
        "color-mix(in oklch, var(--foreground) 12%, transparent)",
    },
  ".cm-placeholder": {
    color: "color-mix(in oklch, var(--foreground) 45%, transparent)",
  },
})

function getExportName(code: string) {
  const firstMeaningfulLine = code
    .split("\n")
    .map((line) => line.trim())
    .find((line) => line.length > 0 && !line.startsWith("%%"))

  const label = firstMeaningfulLine ?? "beautiful-diagram"
  const normalized = label
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")

  return normalized || "beautiful-diagram"
}

function getThemeLabel(themeName: string) {
  return themeName
    .split("-")
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(" ")
}

function getSvgDimensions(svg: string) {
  const widthMatch = svg.match(/width="([\d.]+)"/)
  const heightMatch = svg.match(/height="([\d.]+)"/)

  if (widthMatch && heightMatch) {
    return {
      width: Number(widthMatch[1]),
      height: Number(heightMatch[1]),
    }
  }

  const viewBoxMatch = svg.match(
    /viewBox="[\d.\-]+ [\d.\-]+ ([\d.]+) ([\d.]+)"/
  )

  if (viewBoxMatch) {
    return {
      width: Number(viewBoxMatch[1]),
      height: Number(viewBoxMatch[2]),
    }
  }

  return null
}

function ZoomablePreview({
  svg,
  diagramKey,
}: {
  svg: string
  diagramKey: string
}) {
  const [container, setContainer] = useState<HTMLDivElement | null>(null)
  const [containerSize, setContainerSize] = useState({ width: 0, height: 0 })

  const svgSize = useMemo(() => getSvgDimensions(svg), [svg])

  useEffect(() => {
    if (!container) {
      return
    }

    const updateSize = (width: number, height: number) => {
      setContainerSize({ width, height })
    }

    const rect = container.getBoundingClientRect()
    updateSize(rect.width, rect.height)

    const observer = new ResizeObserver((entries) => {
      const entry = entries[0]

      if (entry) {
        updateSize(entry.contentRect.width, entry.contentRect.height)
      }
    })

    observer.observe(container)

    return () => {
      observer.disconnect()
    }
  }, [container])

  const initialTransform = useMemo(() => {
    if (
      !svgSize ||
      containerSize.width <= 0 ||
      containerSize.height <= 0 ||
      svgSize.width <= 0 ||
      svgSize.height <= 0
    ) {
      return null
    }

    const availableWidth = Math.max(containerSize.width - CANVAS_PADDING * 2, 1)
    const availableHeight = Math.max(
      containerSize.height - CANVAS_PADDING * 2,
      1
    )

    const scale =
      Math.min(
        availableWidth / svgSize.width,
        availableHeight / svgSize.height
      ) * CANVAS_FIT_RATIO
    const scaledWidth = svgSize.width * scale
    const scaledHeight = svgSize.height * scale
    const centeredY = (containerSize.height - scaledHeight) / 2
    const biasedY =
      centeredY - Math.min(containerSize.height * 0.06, CANVAS_TOP_BIAS)

    return {
      scale,
      positionX: (containerSize.width - scaledWidth) / 2,
      positionY: Math.max(CANVAS_PADDING, biasedY),
    }
  }, [containerSize.height, containerSize.width, svgSize])

  return (
    <div ref={setContainer} className="h-full w-full">
      {initialTransform ? (
        <TransformWrapper
          key={`${diagramKey}:${Math.round(containerSize.width)}:${Math.round(containerSize.height)}`}
          initialScale={initialTransform.scale}
          initialPositionX={initialTransform.positionX}
          initialPositionY={initialTransform.positionY}
          minScale={Math.max(initialTransform.scale * 0.75, 0.2)}
          maxScale={Math.max(initialTransform.scale * 6, 2)}
          limitToBounds={false}
          centerZoomedOut={false}
          disablePadding
          doubleClick={{ disabled: true }}
          wheel={{ step: 0.012 }}
          pinch={{ step: 0.8 }}
          panning={{
            allowLeftClickPan: true,
            velocityDisabled: true,
          }}
          velocityAnimation={{ disabled: true }}
          zoomAnimation={{
            size: 0.04,
            animationTime: 140,
          }}
          autoAlignment={{
            disabled: true,
          }}
        >
          <TransformComponent
            wrapperStyle={{
              width: "100%",
              height: "100%",
            }}
            wrapperProps={{
              className: "cursor-grab active:cursor-grabbing touch-none",
            }}
            contentProps={{
              className: "select-none",
            }}
          >
            <div
              className="[&_svg]:h-auto [&_svg]:max-w-none"
              dangerouslySetInnerHTML={{ __html: svg }}
            />
          </TransformComponent>
        </TransformWrapper>
      ) : null}
    </div>
  )
}

function MermaidEditor({
  value,
  onChange,
}: {
  value: string
  onChange: (value: string) => void
}) {
  const containerRef = useRef<HTMLDivElement | null>(null)
  const editorRef = useRef<EditorView | null>(null)
  const onChangeRef = useRef(onChange)
  const initialValueRef = useRef(value)

  useEffect(() => {
    onChangeRef.current = onChange
  }, [onChange])

  useEffect(() => {
    if (!containerRef.current) {
      return
    }

    const editor = new EditorView({
      state: EditorState.create({
        doc: initialValueRef.current,
        extensions: [
          basicSetup,
          mermaid(),
          keymap.of([indentWithTab]),
          syntaxHighlighting(mermaidHighlightStyle),
          mermaidEditorTheme,
          EditorView.lineWrapping,
          EditorView.contentAttributes.of({
            "aria-label": "Mermaid diagram code",
            spellcheck: "false",
          }),
          placeholder(EDITOR_PLACEHOLDER),
          EditorView.updateListener.of((update) => {
            if (update.docChanged) {
              onChangeRef.current(update.state.doc.toString())
            }
          }),
        ],
      }),
      parent: containerRef.current,
    })

    editorRef.current = editor

    return () => {
      editor.destroy()
      editorRef.current = null
    }
  }, [])

  useEffect(() => {
    const editor = editorRef.current

    if (!editor) {
      return
    }

    const currentValue = editor.state.doc.toString()

    if (currentValue === value) {
      return
    }

    editor.dispatch({
      changes: {
        from: 0,
        to: currentValue.length,
        insert: value,
      },
    })
  }, [value])

  return <div ref={containerRef} className="h-full min-h-[40svh] w-full" />
}

function App() {
  const [code, setCode] = useState(INITIAL_CODE)
  const [themeName, setThemeName] = useState(DEFAULT_THEME)
  const deferredCode = useDeferredValue(code)
  const isRendering = deferredCode !== code
  const hasCode = code.trim().length > 0
  const renderOptions = THEMES[themeName]
  const diagramKey = `${themeName}:${deferredCode}`

  const renderState = useMemo(() => {
    if (!deferredCode.trim()) {
      return { svg: null, error: null }
    }

    try {
      return {
        svg: renderMermaidSVG(deferredCode, renderOptions),
        error: null,
      }
    } catch (error) {
      return {
        svg: null,
        error:
          error instanceof Error
            ? error.message
            : "Something went wrong while rendering this diagram.",
      }
    }
  }, [deferredCode, renderOptions])

  const exportDisabled = !hasCode || isRendering || !!renderState.error

  function handleExport() {
    if (exportDisabled) {
      return
    }

    const svg = renderMermaidSVG(code, renderOptions)
    const blob = new Blob([svg], {
      type: "image/svg+xml;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const link = document.createElement("a")

    link.href = url
    link.download = `${getExportName(code)}.svg`
    link.click()

    URL.revokeObjectURL(url)
  }

  return (
    <main className="min-h-svh p-0">
      <div className="min-h-svh">
        <div className="grid min-h-svh lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)]">
          <section className="min-h-[40svh] border-b border-border lg:min-h-svh lg:border-r lg:border-b-0">
            <span className="sr-only">Mermaid diagram code</span>

            <div id="mermaid-code" className="min-h-[40svh] lg:min-h-svh">
              <MermaidEditor value={code} onChange={setCode} />
            </div>
          </section>

          <section className="relative flex min-h-[40svh] min-w-0 items-center justify-center px-3 py-3 lg:min-h-svh lg:px-4 lg:py-4">
            <div className="absolute top-4 right-4 z-10 flex items-center gap-2">
              <Select
                value={themeName}
                onValueChange={(value) => {
                  if (value) {
                    setThemeName(value)
                  }
                }}
              >
                <SelectTrigger
                  aria-label="Diagram theme"
                  className="min-w-44 rounded-md"
                >
                  <SelectValue placeholder="Select theme" />
                </SelectTrigger>
                <SelectContent align="end">
                  {THEME_NAMES.map((name) => (
                    <SelectItem key={name} value={name}>
                      {getThemeLabel(name)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button onClick={handleExport} disabled={exportDisabled}>
                <Download className="size-4" />
                Export SVG
              </Button>
            </div>

            <div className="flex h-full w-full items-center justify-center overflow-hidden">
              {!hasCode ? (
                <div className="text-sm text-muted-foreground">Preview</div>
              ) : renderState.error ? (
                <div className="max-w-2xl text-left">
                  <pre className="overflow-auto font-mono text-sm leading-6 whitespace-pre-wrap text-destructive">
                    {renderState.error}
                  </pre>
                </div>
              ) : (
                <ZoomablePreview
                  svg={renderState.svg ?? ""}
                  diagramKey={diagramKey}
                />
              )}
            </div>
          </section>
        </div>
      </div>
    </main>
  )
}
