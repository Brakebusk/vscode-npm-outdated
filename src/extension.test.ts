import { describe, expect, it, vi } from "vitest"
import { COMMAND_INSTALL, COMMAND_INSTALL_REQUEST } from "./Command.js"
import { vscodeSimulator } from "./TestUtils.js"
import { Icons } from "./Theme.js"

vi.mock("vscode", () => {
  class Range {
    public start: { character: number; line: number }
    public end: { character: number; line: number }

    constructor(
      startLine: number,
      startCharacter: number,
      endLine: number,
      endCharacter: number
    ) {
      this.start = { character: startCharacter, line: startLine }
      this.end = { character: endCharacter, line: endLine }
    }
  }

  const ExtensionContext = vi.fn(() => ({
    subscriptions: vi.fn(() => ({
      push: vi.fn(),
    })),
  }))

  class Diagnostic {
    constructor(
      public range: typeof Range,
      public message: string,
      public severity?: DiagnosticSeverity
    ) {}
  }

  enum DiagnosticSeverity {
    Error,
    Warning,
    Information,
    Hint,
  }

  const CodeActionKind = {
    QuickFix: "QuickFix",
  }

  const commands = {}

  const languages = {
    registerCodeActionsProvider: vi.fn(),
  }

  const window = {
    createTextEditorDecorationType: (): symbol => Symbol(),
  }

  const Uri = {
    parse: (): undefined => undefined,
  }

  const workspace = vi.fn()

  const WorkspaceEdit = vi.fn(() => ({
    replace: (): undefined => undefined,
  }))

  class CodeAction {
    constructor(public title: string) {}
  }

  const l10n = {
    t: (message: string, ...args: unknown[]): string => {
      let messageModified = message

      args.forEach((arg, argIndex) => {
        messageModified = messageModified.replace(
          new RegExp(`\\{${argIndex}\\}`, "g"),
          String(arg)
        )
      })

      return messageModified
    },
  }

  return {
    CodeAction,
    CodeActionKind,
    commands,
    Diagnostic,
    DiagnosticSeverity,
    ExtensionContext,
    l10n,
    languages,
    Range,
    Uri,
    window,
    workspace,
    WorkspaceEdit,
  }
})

describe("package diagnostics", () => {
  it("initialization without a package.json", async () => {
    const { decorations, diagnostics } = await vscodeSimulator()

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([])
  })

  it("initialization without an empty package.json", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: "",
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([])
  })

  it("initialization with package.json without dependencies", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {},
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([])
  })

  it("valid dependency, already installed, just formalization", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(diagnostics[0]?.message).toContain("1.0.1")
    expect(decorations[0]).toContain("(already installed, just formalization)")
  })

  it("valid dependency, newer version available", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(decorations[0]).toContain("Update available:")
  })

  it("valid dependency, newer version available, avoid major dump", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(diagnostics[0]?.message).toContain("1.0.1")
    expect(decorations[0]).toContain("Update available:")
  })

  it("valid dependency, newer version available, suggesting major dump", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(diagnostics[0]?.message).toContain("2.0.0")
    expect(decorations[0]).toContain("(attention: major update!)")
  })

  it("valid dependency, newer version available, major dump protection disabled", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      configurations: { majorUpdateProtection: false },
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(diagnostics[0]?.message).toContain("2.0.0")
    expect(decorations[0]).toContain("(attention: major update!)")
  })

  it("valid dependency, newer version available (using cache)", async () => {
    const { decorations: decorations1, diagnostics: diagnostics1 } =
      await vscodeSimulator({
        packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
        packagesInstalled: { "npm-outdated": "1.0.0" },
        packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      })

    expect(diagnostics1[0]?.message).toContain("Newer version")
    expect(decorations1[0]).toContain("Update available:")

    const { decorations: decorations2, diagnostics: diagnostics2 } =
      await vscodeSimulator({
        cacheEnabled: true,
        packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
        packagesInstalled: { "npm-outdated": "1.0.0" },
        packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      })

    expect(diagnostics2[0]?.message).toContain("Newer version")
    expect(decorations2[0]).toContain("Update available:")
  })

  it("valid dev dependency, newer version available", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { devDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(diagnostics[0]?.message).toContain("1.0.1")
    expect(decorations[0]).toContain("Update available:")
  })

  it("valid dependency, package version not available", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
    })

    expect(diagnostics[0]?.message).toContain("not available")
    expect(decorations[0]).toContain("(install pending)")
  })

  it("valid dependency, latest pre-release", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.1-alpha" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1-alpha"] },
    })

    expect(diagnostics[0]?.message).toContain("Pre-release version")
    expect(decorations[0]).toContain(Icons.CHECKED)
  })

  it("valid dependency, newer pre-release available", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.1-alpha" },
      packagesRepository: {
        "npm-outdated": ["1.0.0", "1.0.1-alpha", "1.0.2-alpha"],
      },
    })

    expect(diagnostics[0]?.message).toContain("1.0.2-alpha")
    expect(decorations[0]).toContain("<pre-release>")
  })

  it("valid dependency, newer stable-after pre-release available", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.1-alpha" },
      packagesRepository: {
        "npm-outdated": ["1.0.0", "1.0.1-alpha", "1.0.1"],
      },
    })

    expect(diagnostics[0]?.message).toContain("1.0.1")
    expect(decorations[0]).toContain("Update available:")
    expect(decorations[0]).not.toContain("(attention: major update!)")
  })

  it("valid dependency, upgrading to major pre-release", async () => {
    const { decorations } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^2.0.0-alpha" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: {
        "npm-outdated": ["1.0.0", "2.0.0-alpha", "2.0.0"],
      },
    })

    expect(decorations[0]).toContain("Update available:")
    expect(decorations[0]).toContain("2.0.0")
    expect(decorations[0]).toContain("(attention: major update!)")
  })

  it("valid dependency, latest available version", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations[0]).toStrictEqual([Icons.CHECKED])
  })

  it("valid dependency, with partial version", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations[0]).toStrictEqual([Icons.CHECKED])
  })

  it("valid dependency, suggests minor or greater only", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      configurations: { level: "minor" },
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations[0]).toStrictEqual([Icons.CHECKED])
  })

  it("valid dependency, but cannot get latest version (exception case)", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations[0]).toStrictEqual([Icons.CHECKED])
  })

  it("valid dependency, no diagnostic", async () => {
    const { diagnostics } = await vscodeSimulator({
      configurations: { level: "major" },
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics).toHaveLength(0)
  })

  it("valid dependency, with major already installed must not show 'major' tooltip", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "2.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "2.0.0"] },
    })

    expect(diagnostics[0]?.message).toContain("available: 1.0.1")
    expect(decorations[0]).not.toContain("(attention: major update!)")
  })

  it("dependency name is invalid", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "invalid!": "^1.0.0" } },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([]) // No requires diagnostics.
  })

  it("dependency version is complex", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0 || ^2.0.0" } },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([]) // No requires diagnostics.
  })

  it("dependency version is invalid", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^a.b.c" } },
    })

    expect(diagnostics[0]?.message).toContain("Invalid package version")
    expect(decorations).toStrictEqual([])
  })

  it("dependency version is incomplete/empty", async () => {
    const { decorations } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "" } },
      packagesRepository: { "npm-outdated": ["1.0.0"] },
    })

    expect(decorations[0]).toContain("(install pending)")
  })

  it("decorations simple", async () => {
    const { decorations } = await vscodeSimulator({
      configurations: { decorations: "simple" },
      packageJson: { devDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(decorations[0]).toContain(
      `${Icons.UPDATABLE} Update available: 1.0.1`
    )
  })

  it("decorations disabled", async () => {
    const { decorations } = await vscodeSimulator({
      configurations: { decorations: "disabled" },
      packageJson: { devDependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(decorations).toStrictEqual([])
  })

  it("package dependes on auth, so npm view will be used (found)", async () => {
    const { diagnostics } = await vscodeSimulator({
      packageJson: { devDependencies: { "@private/npm-outdated": "^1.0.0" } },
      packagesInstalled: { "@private/npm-outdated": "1.0.0" },
      packagesRepository: { "@private/npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics[0]?.message).toContain("Newer version")
    expect(diagnostics[0]?.message).toContain("1.0.1")
  })

  it("package dependes on auth, so npm view will be used (not found)", async () => {
    const { diagnostics } = await vscodeSimulator({
      packageJson: { devDependencies: { "@private/jest": "^1.0.0" } },
      packagesInstalled: { "@private/jest": "1.0.0" },
      packagesRepository: { "@private/jest": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics).toStrictEqual([])
  })
})

describe("code actions", () => {
  it("no package selected", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      selectFirsts: 0,
    })

    expect(actions).toHaveLength(0)
  })

  it("no package selected, must not have any action", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.1" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      selectFirsts: 0,
    })

    expect(actions).toHaveLength(0)
  })

  it("selected a specific package, ready to install", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.1",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    })

    expect(actions[0]?.title).toBe('Update "npm-outdated" to 1.0.1')
    expect(actions[1]?.title).toBe("Install package")
    expect(actions).toHaveLength(2)
  })

  it("selected two packages, ready to install", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.1",
          "npm-outdated": "^1.0.1",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    })

    expect(actions[0]?.title).toBe("Install packages")
    expect(actions).toHaveLength(1)
  })

  it("selected a specific package", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      selectFirsts: 1,
    })

    expect(actions[0]?.title).toBe('Update "npm-outdated" to 1.0.1')
    expect(actions).toHaveLength(1)
  })

  it("selected first package only", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 1,
    })

    expect(actions[0]?.title).toBe('Update "@types/jest" to 1.0.1')
    expect(actions[1]?.title).toBe("Update all 2 packages")
    expect(actions).toHaveLength(2)
  })

  it("selected first package only, both major updates", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "2.0.0"],
      },
      selectFirsts: 1,
    })

    expect(actions[0]?.title).toBe('Update "@types/jest" to 2.0.0 (major)')
    expect(actions[1]?.title).toBe("Update all 2 packages (major)")
    expect(actions).toHaveLength(2)
  })

  it("selected first package only, both major updates (protection disabled)", async () => {
    const { actions } = await vscodeSimulator({
      configurations: {
        majorUpdateProtection: false,
      },
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "2.0.0"],
      },
      selectFirsts: 1,
    })

    expect(actions[0]?.title).toBe('Update "@types/jest" to 2.0.0')
    expect(actions[1]?.title).toBe("Update all 2 packages")
    expect(actions).toHaveLength(2)
  })

  it("selected all two packages, with waiting for install another", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "node-fetch": "^1.0.1",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "node-fetch": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "1.0.1"],
        "node-fetch": ["1.0.0", "1.0.1"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 3,
    })

    expect(actions[0]?.title).toBe("Update 2 selected packages")
    expect(actions[1]?.title).toBe("Install package")
    expect(actions).toHaveLength(2)
  })

  it("selected all two packages, but one is major update (protection enabled)", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    })

    expect(actions[0]?.title).toBe('Update "npm-outdated" to 1.0.1')
    expect(actions).toHaveLength(1)
  })

  it("selected all two packages, but one is major update (protection disabled)", async () => {
    const { actions } = await vscodeSimulator({
      configurations: {
        majorUpdateProtection: false,
      },
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "1.0.1"],
      },
      selectFirsts: 2,
    })

    expect(actions[0]?.title).toBe("Update 2 selected packages")
    expect(actions).toHaveLength(1)
  })

  it("selected all two packages, both are major update", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "^1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesInstalled: {
        "@types/jest": "1.0.0",
        "npm-outdated": "1.0.0",
      },
      packagesRepository: {
        "@types/jest": ["1.0.0", "2.0.0"],
        "npm-outdated": ["1.0.0", "2.0.0"],
      },
      selectFirsts: 2,
    })

    expect(actions[0]?.title).toBe("Update 2 selected packages (major)")
    expect(actions).toHaveLength(1)
  })
})

describe("commands", () => {
  it("notify install", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "2.0.0"] },
      runAction: {
        args: [{ save: vi.fn(), uri: { fsPath: "./test" } }],
        name: COMMAND_INSTALL_REQUEST,
      },
      selectFirsts: 1,
    })

    expect(actions).toHaveLength(1)
  })

  it("install success", async () => {
    const { actions } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "2.0.0"] },
      runAction: {
        args: ["npm install", "./"],
        name: COMMAND_INSTALL,
      },
      selectFirsts: 1,
    })

    expect(actions).toHaveLength(1)
  })

  it("install failure", async () => {
    const { actions } = await vscodeSimulator({
      execError: true,
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "2.0.0"] },
      runAction: {
        args: ["npm install", "./"],
        name: COMMAND_INSTALL,
      },
      selectFirsts: 1,
    })

    expect(actions).toHaveLength(1)
  })
})

describe("code coverage", () => {
  it("simulate change active text editor", async () => {
    const { decorations, diagnostics, document, subscriptions } =
      await vscodeSimulator()

    subscriptions.find(
      (subscription) => subscription[0] === "onDidChangeActiveTextEditor"
    )?.[1]({ document })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([])
  })

  it("simulate change text document", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      triggerChangeAfter: true,
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([])
  })

  it("simulate packages-lock.json change", async () => {
    const { decorations, diagnostics, subscriptions } = await vscodeSimulator()

    subscriptions.find(
      (subscription) => subscription[0] === "onDidChange"
    )?.[1]()

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toStrictEqual([])
  })

  it("simulate close text document", async () => {
    const { decorations, diagnostics, document, subscriptions } =
      await vscodeSimulator({
        packageJson: { dependencies: { "npm-outdated": "^a.b.c" } },
      })

    subscriptions.find(
      (subscription) => subscription[0] === "onDidCloseTextDocument"
    )?.[1](document)

    expect(diagnostics).toHaveLength(1)
    expect(decorations).toStrictEqual([])
  })

  it("decoration re-flush layers", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: { dependencies: { "npm-outdated": "^1.0.0" } },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
      triggerChangeAfter: true,
    })

    expect(diagnostics).toHaveLength(1)
    expect(decorations[0]).toContain("Update available:")
  })
})

describe("security advisories", () => {
  it("updatable", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      cacheEnabled: true,
      packageJson: {
        dependencies: {
          "@types/jest": "1.0.0",
          "npm-outdated": "^1.0.0",
        },
      },
      packagesAdvisories: {
        "npm-outdated": [
          {
            cvss: { score: 5.6 },
            severity: "high",
            title: "flaw",
            url: "https://testing",
            vulnerable_versions: "1.0.0",
          },
        ],
      },
      packagesInstalled: { "npm-outdated": "1.0.0" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1"] },
    })

    expect(diagnostics).toHaveLength(2)
    expect(diagnostics[1]?.message).toContain("Security advisory:")
    expect(decorations[0]).toHaveLength(1)
    expect(decorations[1]).toContain("Security advisory (HIGH/5.6):")
  })

  it("needs downgrade", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "@types/jest": "1.0.0",
          "npm-outdated": "^1.0.1",
        },
      },
      packagesAdvisories: {
        "npm-outdated": [
          {
            cvss: { score: 5.6 },
            severity: "high",
            title: "flaw",
            url: "https://testing",
            vulnerable_versions: "1.0.1",
          },
        ],
      },
      packagesInstalled: { "npm-outdated": "1.0.1" },
      packagesRepository: { "npm-outdated": ["1.0.0", "1.0.1", "1.0.1-alpha"] },
    })

    expect(diagnostics).toHaveLength(1)
    expect(diagnostics[0]?.message).toContain("downgrade")
    expect(decorations[0]).toHaveLength(1)
    expect(decorations[1]).toContain("Security advisory (HIGH/5.6):")
  })

  it("ignore directory-versions", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "npm-outdated-2": "../src",
          "npm-outdated-3": "./src",
          "npm-outdated-4": "~/src",
          "npm-outdated-5": "/src",
        },
      },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toHaveLength(0)
  })

  it("ignore protocol versions", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "npm-outdated-1": "file:/src",
          "npm-outdated-2": "http://...",
          "npm-outdated-3": "https://...",
          "npm-outdated-4": "git://...",
          "npm-outdated-5": "git+ssh://...",
        },
      },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toHaveLength(0)
  })

  it("ignore github packages", async () => {
    const { decorations, diagnostics } = await vscodeSimulator({
      packageJson: {
        dependencies: {
          "npm-outdated-1": "mskelton/vscode-npm-outdated",
          "npm-outdated-2": "mskelton/vscode-npm-outdated#1234567890",
          "npm-outdated-3": "mskelton/vscode-npm-outdated#feature/branch",
        },
      },
    })

    expect(diagnostics).toHaveLength(0)
    expect(decorations).toHaveLength(0)
  })
})
