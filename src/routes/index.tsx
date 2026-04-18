import { indentWithTab } from "@codemirror/commands"
import { HighlightStyle, syntaxHighlighting } from "@codemirror/language"
import { EditorState } from "@codemirror/state"
import { keymap, placeholder } from "@codemirror/view"
import { tags as t } from "@lezer/highlight"
import { createFileRoute } from "@tanstack/react-router"
import { createServerFn } from "@tanstack/react-start"
import { renderMermaidSVG, THEMES, type DiagramColors } from "beautiful-mermaid"
import { basicSetup, EditorView } from "codemirror"
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
import {
  ChevronDownIcon,
  Download,
  FileImageIcon,
  FileType2Icon,
  ImageIcon,
} from "lucide-react"
import { useDeferredValue, useEffect, useMemo, useRef, useState } from "react"
import { TransformComponent, TransformWrapper } from "react-zoom-pan-pinch"

import { Button } from "@/components/ui/button"
import { ButtonGroup } from "@/components/ui/button-group"
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuGroup,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu"
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
const CANVAS_TOP_BIAS = 36
const EXPORT_WIDTH = 2560
const EXPORT_HEIGHT = 1440
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

type ExportFormat = "png" | "svg" | "jpeg"
type RasterExportFormat = Exclude<ExportFormat, "svg">

function normalizeHexColor(value: string) {
  const normalized = value.trim()

  if (/^#[\da-f]{3}$/i.test(normalized)) {
    const [, r, g, b] = normalized
    return `#${r}${r}${g}${g}${b}${b}`.toLowerCase()
  }

  return normalized.toLowerCase()
}

function mixHexColors(fg: string, bg: string, percentage: number) {
  const foreground = normalizeHexColor(fg)
  const background = normalizeHexColor(bg)

  if (
    !/^#[\da-f]{6}$/i.test(foreground) ||
    !/^#[\da-f]{6}$/i.test(background)
  ) {
    return percentage >= 50 ? foreground : background
  }

  const blend = (from: number, to: number) =>
    Math.round((from * percentage) / 100 + (to * (100 - percentage)) / 100)

  const [fr, fgValue, fb] = [1, 3, 5].map((index) =>
    Number.parseInt(foreground.slice(index, index + 2), 16)
  )
  const [br, bgValue, bb] = [1, 3, 5].map((index) =>
    Number.parseInt(background.slice(index, index + 2), 16)
  )

  return `#${[blend(fr, br), blend(fgValue, bgValue), blend(fb, bb)]
    .map((value) => value.toString(16).padStart(2, "0"))
    .join("")}`
}

function resolveDiagramColors(colors: DiagramColors) {
  return {
    bg: colors.bg,
    fg: colors.fg,
    line: colors.line ?? mixHexColors(colors.fg, colors.bg, 50),
    accent: colors.accent ?? mixHexColors(colors.fg, colors.bg, 85),
    muted: colors.muted ?? mixHexColors(colors.fg, colors.bg, 40),
    surface: colors.surface ?? mixHexColors(colors.fg, colors.bg, 3),
    border: colors.border ?? mixHexColors(colors.fg, colors.bg, 20),
    text: colors.fg,
    textSec: colors.muted ?? mixHexColors(colors.fg, colors.bg, 60),
    textMuted: colors.muted ?? mixHexColors(colors.fg, colors.bg, 40),
    textFaint: mixHexColors(colors.fg, colors.bg, 25),
    arrow: colors.accent ?? mixHexColors(colors.fg, colors.bg, 85),
    nodeFill: colors.surface ?? mixHexColors(colors.fg, colors.bg, 3),
    nodeStroke: colors.border ?? mixHexColors(colors.fg, colors.bg, 20),
    groupFill: colors.bg,
    groupHeader: mixHexColors(colors.fg, colors.bg, 5),
    innerStroke: mixHexColors(colors.fg, colors.bg, 12),
    keyBadge: mixHexColors(colors.fg, colors.bg, 10),
  }
}

function flattenSvgForRaster(svg: string, colors: DiagramColors) {
  const resolved = resolveDiagramColors(colors)
  const replacements = new Map<string, string>([
    ["var(--bg)", resolved.bg],
    ["var(--fg)", resolved.fg],
    ["var(--line)", resolved.line],
    ["var(--accent)", resolved.accent],
    ["var(--muted)", resolved.muted],
    ["var(--surface)", resolved.surface],
    ["var(--border)", resolved.border],
    ["var(--_text)", resolved.text],
    ["var(--_text-sec)", resolved.textSec],
    ["var(--_text-muted)", resolved.textMuted],
    ["var(--_text-faint)", resolved.textFaint],
    ["var(--_line)", resolved.line],
    ["var(--_arrow)", resolved.arrow],
    ["var(--_node-fill)", resolved.nodeFill],
    ["var(--_node-stroke)", resolved.nodeStroke],
    ["var(--_group-fill)", resolved.groupFill],
    ["var(--_group-hdr)", resolved.groupHeader],
    ["var(--_inner-stroke)", resolved.innerStroke],
    ["var(--_key-badge)", resolved.keyBadge],
  ])

  let flattened = svg
    .replace(/@import url\([^)]*\);\s*/g, "")
    .replace(/background:var\(--bg\)/g, `background:${resolved.bg}`)
    .replace(
      /<style>[\s\S]*?<\/style>/,
      `<style>text { font-family: Arial, Helvetica, "Liberation Sans", "DejaVu Sans", sans-serif; } .mono { font-family: "Courier New", "Liberation Mono", "DejaVu Sans Mono", monospace; }</style>`
    )

  for (const [token, value] of replacements) {
    flattened = flattened.split(token).join(value)
  }

  flattened = flattened.replace(
    /<svg([^>]*)>/,
    `<svg$1><rect width="100%" height="100%" fill="${resolved.bg}" />`
  )

  return { svg: flattened, background: resolved.bg }
}

const exportRasterDiagram = createServerFn({ method: "POST" })
  .inputValidator(
    (data: {
      svg: string
      fileName: string
      format: RasterExportFormat
      colors: DiagramColors
    }) => data
  )
  .handler(async ({ data }) => {
    const sharp = (await import("sharp")).default
    const rasterInput = flattenSvgForRaster(data.svg, data.colors)
    const image = sharp(Buffer.from(rasterInput.svg), { density: 300 })
      .resize(EXPORT_WIDTH, EXPORT_HEIGHT, {
        fit: "contain",
        background: rasterInput.background,
      })
      .flatten({ background: rasterInput.background })

    const buffer =
      data.format === "png"
        ? await image.png().toBuffer()
        : await image.jpeg({ quality: 92 }).toBuffer()

    const body = new Uint8Array(
      buffer.buffer,
      buffer.byteOffset,
      buffer.byteLength
    )

    return new Response(body, {
      headers: {
        "Content-Type": data.format === "png" ? "image/png" : "image/jpeg",
        "Content-Disposition": `attachment; filename="${data.fileName}.${data.format}"`,
      },
    })
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

function getExportLabel(format: ExportFormat) {
  if (format === "png") {
    return "Export PNG"
  }

  if (format === "jpeg") {
    return "Export JPEG"
  }

  return "Export SVG"
}

function getExportIcon(format: ExportFormat) {
  if (format === "png") {
    return ImageIcon
  }

  if (format === "jpeg") {
    return FileImageIcon
  }

  return FileType2Icon
}

function downloadBlob(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob)
  const link = document.createElement("a")

  link.href = url
  link.download = fileName
  link.click()

  URL.revokeObjectURL(url)
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
      centeredY - Math.min(containerSize.height * 0.04, CANVAS_TOP_BIAS)

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
          EditorView.domEventHandlers({
            paste: (_event, view) => {
              const { scrollTop, scrollLeft } = view.scrollDOM

              window.requestAnimationFrame(() => {
                view.scrollDOM.scrollTo({
                  top: scrollTop,
                  left: scrollLeft,
                })
              })

              return false
            },
          }),
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

  return <div ref={containerRef} className="h-full min-h-0 w-full" />
}

function App() {
  const [code, setCode] = useState(INITIAL_CODE)
  const [themeName, setThemeName] = useState(DEFAULT_THEME)
  const [exportingFormat, setExportingFormat] = useState<ExportFormat | null>(
    null
  )
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

  const exportDisabled =
    !hasCode || isRendering || !!renderState.error || exportingFormat !== null

  async function handleExport(format: ExportFormat) {
    if (exportDisabled) {
      return
    }

    const svg = renderMermaidSVG(code, renderOptions)
    const fileName = getExportName(code)

    setExportingFormat(format)

    try {
      if (format === "svg") {
        downloadBlob(
          new Blob([svg], {
            type: "image/svg+xml;charset=utf-8",
          }),
          `${fileName}.svg`
        )
        return
      }

      const response = await exportRasterDiagram({
        data: {
          svg,
          fileName,
          format,
          colors: renderOptions,
        },
      })
      const blob = await response.blob()

      downloadBlob(blob, `${fileName}.${format}`)
    } finally {
      setExportingFormat(null)
    }
  }

  return (
    <main className="min-h-svh p-0 lg:h-svh lg:overflow-hidden">
      <div className="min-h-svh lg:h-full">
        <div className="grid min-h-svh lg:h-full lg:min-h-0 lg:grid-cols-[minmax(260px,0.8fr)_minmax(0,2.2fr)]">
          <section className="min-h-[40svh] border-b border-border lg:min-h-0 lg:overflow-hidden lg:border-r lg:border-b-0">
            <span className="sr-only">Mermaid diagram code</span>

            <div
              id="mermaid-code"
              className="min-h-[40svh] lg:h-full lg:min-h-0 lg:overflow-y-auto lg:overscroll-contain"
            >
              <MermaidEditor value={code} onChange={setCode} />
            </div>
          </section>

          <section className="relative flex min-h-[40svh] min-w-0 items-center justify-center px-3 py-3 lg:min-h-0 lg:overflow-hidden lg:px-4 lg:py-4">
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
                  className="min-w-44 rounded-4xl"
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

              <ButtonGroup>
                <Button
                  onClick={() => handleExport("png")}
                  disabled={exportDisabled}
                >
                  <Download className="size-4" />
                  {exportingFormat === "png"
                    ? "Exporting PNG..."
                    : "Export PNG"}
                </Button>

                <DropdownMenu>
                  <DropdownMenuTrigger
                    render={
                      <Button
                        disabled={exportDisabled}
                        className="px-2.5"
                        aria-label="More export options"
                      >
                        <ChevronDownIcon />
                      </Button>
                    }
                  />
                  <DropdownMenuContent align="end" className="w-44">
                    <DropdownMenuGroup>
                      {(["png", "svg", "jpeg"] as ExportFormat[]).map(
                        (format) => {
                          const Icon = getExportIcon(format)

                          return (
                            <DropdownMenuItem
                              key={format}
                              onClick={() => handleExport(format)}
                            >
                              <Icon />
                              {getExportLabel(format)}
                            </DropdownMenuItem>
                          )
                        }
                      )}
                    </DropdownMenuGroup>
                  </DropdownMenuContent>
                </DropdownMenu>
              </ButtonGroup>
            </div>

            <div className="flex h-full min-h-0 w-full items-center justify-center overflow-hidden">
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
