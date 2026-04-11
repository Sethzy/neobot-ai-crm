/**
 * AST-level check that managed-agent tools preserve explicit tenant filters on
 * Supabase query chains.
 *
 * @module scripts/lint-tool-tenant-filter
 */
import path from "node:path";
import { fileURLToPath } from "node:url";

import { Node, Project, SyntaxKind, type VariableDeclaration } from "ts-morph";

export interface TenantFilterViolation {
  file: string;
  line: number;
  table: string;
  reason: string;
}

function chainHasClientIdEq(fromCall: Node): boolean {
  let currentNode: Node | undefined = fromCall;

  while (currentNode) {
    const parentNode = currentNode.getParent();
    if (!parentNode || !Node.isPropertyAccessExpression(parentNode)) {
      break;
    }

    const nextNode = parentNode.getParent();
    if (!nextNode || !Node.isCallExpression(nextNode)) {
      break;
    }

    if (parentNode.getName() === "eq") {
      const [firstArg, secondArg] = nextNode.getArguments();
      if (
        Node.isStringLiteral(firstArg) &&
        firstArg.getLiteralValue() === "client_id" &&
        isAcceptedClientIdValue(secondArg)
      ) {
        return true;
      }
    }

    currentNode = nextNode;
  }

  return false;
}

function unwrapExpression(node: Node | undefined): Node | undefined {
  if (!node) {
    return undefined;
  }

  if (
    Node.isAsExpression(node) ||
    Node.isTypeAssertion(node) ||
    Node.isParenthesizedExpression(node) ||
    Node.isSatisfiesExpression(node)
  ) {
    return unwrapExpression(node.getExpression());
  }

  return node;
}

function getClientIdPropertyValue(node: Node): Node | undefined {
  const unwrappedNode = unwrapExpression(node);

  if (!unwrappedNode || !Node.isObjectLiteralExpression(unwrappedNode)) {
    return undefined;
  }

  for (const property of unwrappedNode.getProperties()) {
    if (
      Node.isPropertyAssignment(property) &&
      property.getNameNode().getText().replace(/['"]/g, "") === "client_id"
    ) {
      return property.getInitializer();
    }
  }

  return undefined;
}

function getVariableDeclaration(node: Node): VariableDeclaration | undefined {
  const definitions = Node.isIdentifier(node) ? node.getDefinitions() : [];
  for (const definition of definitions) {
    const declarationNode = definition.getDeclarationNode();
    if (declarationNode && Node.isVariableDeclaration(declarationNode)) {
      return declarationNode;
    }
  }

  return undefined;
}

function isAcceptedClientIdValue(node: Node | undefined, seen = new Set<string>()): boolean {
  const unwrappedNode = unwrapExpression(node);
  if (!unwrappedNode) {
    return false;
  }

  const seenKey = `${unwrappedNode.getSourceFile().getFilePath()}:${unwrappedNode.getStart()}`;
  if (seen.has(seenKey)) {
    return false;
  }
  seen.add(seenKey);

  if (Node.isIdentifier(unwrappedNode)) {
    if (unwrappedNode.getText() === "clientId") {
      return true;
    }

    const declaration = getVariableDeclaration(unwrappedNode);
    return declaration
      ? isAcceptedClientIdValue(declaration.getInitializer(), seen)
      : false;
  }

  return Node.isPropertyAccessExpression(unwrappedNode) && unwrappedNode.getName() === "clientId";
}

function everyTrackedWriteIncludesClientId(node: Node | undefined, seen = new Set<string>()): boolean {
  const unwrappedNode = unwrapExpression(node);
  if (!unwrappedNode) {
    return false;
  }

  const seenKey = `${unwrappedNode.getSourceFile().getFilePath()}:${unwrappedNode.getStart()}`;
  if (seen.has(seenKey)) {
    return false;
  }
  seen.add(seenKey);

  if (Node.isObjectLiteralExpression(unwrappedNode)) {
    const clientIdValue = getClientIdPropertyValue(unwrappedNode);
    return clientIdValue ? isAcceptedClientIdValue(clientIdValue) : false;
  }

  if (Node.isArrayLiteralExpression(unwrappedNode)) {
    const elements = unwrappedNode.getElements();
    return elements.length > 0 && elements.every((element) => everyTrackedWriteIncludesClientId(element, seen));
  }

  if (Node.isIdentifier(unwrappedNode)) {
    const declaration = getVariableDeclaration(unwrappedNode);
    if (!declaration) {
      return false;
    }

    const initializer = declaration.getInitializer();
    if (initializer && initializer.getKind() !== SyntaxKind.ArrayLiteralExpression) {
      return everyTrackedWriteIncludesClientId(initializer, seen);
    }

    const references = unwrappedNode.findReferencesAsNodes();
    const pushArguments: Node[] = [];
    const assignmentValues: Node[] = [];

    for (const reference of references) {
      const parentNode = reference.getParent();
      if (Node.isBinaryExpression(parentNode) && parentNode.getLeft() === reference) {
        assignmentValues.push(parentNode.getRight());
      }
      if (
        Node.isPropertyAccessExpression(parentNode) &&
        parentNode.getExpression() === reference &&
        parentNode.getName() === "push"
      ) {
        const callNode = parentNode.getParent();
        if (Node.isCallExpression(callNode)) {
          pushArguments.push(...callNode.getArguments());
        }
      }
    }

    if (assignmentValues.length > 0) {
      return assignmentValues.every((valueNode) => everyTrackedWriteIncludesClientId(valueNode, seen));
    }

    return pushArguments.length > 0
      ? pushArguments.every((valueNode) => everyTrackedWriteIncludesClientId(valueNode, seen))
      : false;
  }

  if (Node.isCallExpression(unwrappedNode)) {
    const expression = unwrappedNode.getExpression();
    const symbol = expression.getSymbol();
    if (!symbol) {
      return false;
    }

    for (const declaration of symbol.getDeclarations()) {
      if (
        Node.isFunctionDeclaration(declaration) ||
        Node.isFunctionExpression(declaration) ||
        Node.isArrowFunction(declaration)
      ) {
        const body = declaration.getBody();
        if (!body) {
          continue;
        }

        if (
          Node.isArrowFunction(declaration) &&
          !Node.isBlock(body) &&
          everyTrackedWriteIncludesClientId(body, seen)
        ) {
          return true;
        }

        if (Node.isBlock(body)) {
          const returnStatements = body.getDescendantsOfKind(SyntaxKind.ReturnStatement);
          if (
            returnStatements.length > 0 &&
            returnStatements.every((statement) =>
              everyTrackedWriteIncludesClientId(statement.getExpression(), seen))
          ) {
            return true;
          }
        }
      }
    }
  }

  return false;
}

function getChainedMethodCall(fromCall: Node, methodNames: string[]): Node | undefined {
  let currentNode: Node | undefined = fromCall;

  while (currentNode) {
    const parentNode = currentNode.getParent();
    if (!parentNode || !Node.isPropertyAccessExpression(parentNode)) {
      break;
    }

    const nextNode = parentNode.getParent();
    if (!nextNode || !Node.isCallExpression(nextNode)) {
      break;
    }

    if (methodNames.includes(parentNode.getName())) {
      return nextNode;
    }

    currentNode = nextNode;
  }

  return undefined;
}

function hasTenantNeutralAnnotation(fromCall: Node): boolean {
  for (const comment of fromCall.getLeadingCommentRanges()) {
    if (comment.getText().includes("@tenant-neutral")) {
      return true;
    }
  }

  const sourceFile = fromCall.getSourceFile();
  const lineNumber = fromCall.getStartLineNumber();
  const previousLine = sourceFile.getFullText().split("\n")[lineNumber - 2] ?? "";

  return previousLine.includes("@tenant-neutral");
}

export function lintToolTenantFilter(files: string[]): TenantFilterViolation[] {
  const project = new Project({
    compilerOptions: {
      allowJs: false,
      noEmit: true,
      skipLibCheck: true,
    },
    useInMemoryFileSystem: false,
  });

  for (const file of files) {
    project.addSourceFileAtPath(file);
  }

  const violations: TenantFilterViolation[] = [];

  for (const sourceFile of project.getSourceFiles()) {
    sourceFile.forEachDescendant((node) => {
      if (!Node.isCallExpression(node)) {
        return;
      }

      const expression = node.getExpression();
      if (!Node.isPropertyAccessExpression(expression) || expression.getName() !== "from") {
        return;
      }

      const [firstArg] = node.getArguments();
      if (!Node.isStringLiteral(firstArg)) {
        return;
      }

      if (hasTenantNeutralAnnotation(node)) {
        return;
      }

      const tableName = firstArg.getLiteralValue();
      const writeCall = getChainedMethodCall(node, ["insert", "upsert"]);
      if (writeCall) {
        const [writePayload] = writeCall.getArguments();
        if (everyTrackedWriteIncludesClientId(writePayload)) {
          return;
        }

        violations.push({
          file: sourceFile.getFilePath(),
          line: node.getStartLineNumber(),
          table: tableName,
          reason:
            `.from("${tableName}") write payload must include client_id: context.clientId ` +
            `or be marked // @tenant-neutral`,
        });
        return;
      }

      if (chainHasClientIdEq(node)) {
        return;
      }

      violations.push({
        file: sourceFile.getFilePath(),
        line: node.getStartLineNumber(),
        table: tableName,
        reason:
          `.from("${tableName}") must be followed by ` +
          `.eq("client_id", context.clientId) or marked // @tenant-neutral`,
      });
    });
  }

  return violations;
}

export function collectToolFiles(rootDir: string): string[] {
  const project = new Project({ useInMemoryFileSystem: false });
  project.addSourceFilesAtPaths(`${rootDir}/**/*.ts`);

  return project
    .getSourceFiles()
    .map((sourceFile) => sourceFile.getFilePath())
    .filter((filePath) => !filePath.includes("__tests__"))
    .filter((filePath) => !filePath.includes("__fixtures__"))
    .filter((filePath) => !filePath.endsWith(".test.ts"))
    .filter((filePath) => !filePath.endsWith("/index.ts"))
    .filter((filePath) => !filePath.endsWith("/types.ts"))
    .filter((filePath) => !filePath.endsWith("/declarations.ts"))
    .sort();
}

function runCli() {
  const currentFile = fileURLToPath(import.meta.url);
  const currentDir = path.dirname(currentFile);
  const rootDir = path.resolve(currentDir, "..", "src", "lib", "managed-agents", "tools");
  const files = collectToolFiles(rootDir);
  const violations = lintToolTenantFilter(files);

  if (violations.length > 0) {
    console.error(`\n✗ lint-tool-tenant-filter: ${violations.length} violation(s)\n`);
    for (const violation of violations) {
      console.error(`${violation.file}:${violation.line} - ${violation.reason}`);
    }
    process.exit(1);
  }

  console.log(`✓ lint-tool-tenant-filter: ${files.length} file(s) checked, no violations.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  runCli();
}
