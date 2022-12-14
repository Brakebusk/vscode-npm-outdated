import {
  DecorationOptions,
  Position,
  Range,
  TextDocument,
  TextEditor,
  ThemableDecorationAttachmentRenderOptions,
  window,
} from "vscode"

import { PackageRelatedDiagnostic } from "./Diagnostic"
import { PackagesInstalled } from "./NPM"
import { lazyCallback } from "./Utils"

class Message {
  constructor(
    public message: string,
    public style?: ThemableDecorationAttachmentRenderOptions
  ) {}
}

// We need to create some decoration levels as needed.
// Each layer must have its own style implementation, so that the message order is respected.
// @see https://github.com/microsoft/vscode/issues/169051
export class DocumentDecorationManager {
  private static documents = new WeakMap<
    TextDocument,
    DocumentDecorationManager
  >()

  public layers: DocumentDecorationLayer[] = []

  public getLayer(layer: number): DocumentDecorationLayer {
    if (this.layers[layer] === undefined) {
      this.layers[layer] = new DocumentDecorationLayer()
    }

    return this.layers[layer]
  }

  // Returns the decoration layers of a document.
  // If the document has never been used, then instantiate and return.
  public static from(document: TextDocument) {
    if (!this.documents.has(document)) {
      this.documents.set(document, new DocumentDecorationManager())
    }

    return this.documents.get(document) as DocumentDecorationManager
  }

  // When the document is closed, then it unloads the layers defined for it.
  public static flush(document: TextDocument) {
    DocumentDecorationManager.from(document).layers.forEach((layer) => {
      window.visibleTextEditors.forEach((editor) => {
        if (editor.document === document) {
          editor.setDecorations(layer.type, [])
        }
      })
    })

    this.documents.delete(document)
  }
}

class DocumentDecorationLayer {
  public lines: Record<number, DecorationOptions> = []

  public type = window.createTextEditorDecorationType({})
}

export class DocumentDecoration {
  private editors: TextEditor[]

  private render = lazyCallback(() => {
    DocumentDecorationManager.from(this.document).layers.forEach((layer) => {
      this.editors.forEach((editor) =>
        editor.setDecorations(layer.type, Object.values(layer.lines).flat())
      )
    })
  })

  constructor(private document: TextDocument) {
    this.editors = window.visibleTextEditors.filter(
      (editor) => editor.document === document
    )
  }

  private setLine(line: number, messages: Message[]) {
    const decorationManager = DocumentDecorationManager.from(this.document)

    messages.forEach((message, messageIndex) => {
      const decorationLayer = decorationManager.getLayer(messageIndex)

      decorationLayer.lines[line] = {
        range: new Range(new Position(line, 4096), new Position(line, 4096)),
        renderOptions: {
          after: {
            color: "silver",
            contentText: message.message,
            margin: `0 0 0 ${messageIndex === 0 ? 2 : 1}ch`,
            ...message.style,
          },
        },
      }
    })

    this.render()
  }

  public clearLine(line: number): void {
    DocumentDecorationManager.from(this.document).layers.forEach(
      (decoration) => {
        delete decoration.lines[line]
      }
    )

    this.render()
  }

  public setCheckingMessage(line: number) {
    this.setLine(line, [new Message("🗘")])
  }

  public async setUpdateMessage(
    line: number,
    packageInfo: PackageRelatedDiagnostic,
    packagesInstalled?: PackagesInstalled
  ) {
    const packageVersionInstalled =
      packagesInstalled?.[packageInfo.packageRelated.name]

    const updateDetails = [
      new Message(`⚠ Update available:`, { color: "gray" }),
      new Message(packageInfo.packageRelated.versionLatest, { color: "blue" }),
    ]

    if (packageInfo.packageRelated.versionLatest === packageVersionInstalled) {
      updateDetails.push(new Message(`(already installed)`, { color: "black" }))
    }

    this.setLine(line, updateDetails)
  }
}
