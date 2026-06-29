import { cleanHeader, toNumber } from "./dataUtils.js";

const FUNCTIONS = {
  sqrt: { min: 1, max: 1, fn: ([x]) => Math.sqrt(x) },
  abs: { min: 1, max: 1, fn: ([x]) => Math.abs(x) },
  pow: { min: 2, max: 2, fn: ([x, y]) => Math.pow(x, y) },
  min: { min: 1, max: Infinity, fn: (values) => Math.min(...values) },
  max: { min: 1, max: Infinity, fn: (values) => Math.max(...values) },
  sin: { min: 1, max: 1, fn: ([x]) => Math.sin(x) },
  cos: { min: 1, max: 1, fn: ([x]) => Math.cos(x) },
  tan: { min: 1, max: 1, fn: ([x]) => Math.tan(x) },
  log: { min: 1, max: 1, fn: ([x]) => Math.log(x) },
  exp: { min: 1, max: 1, fn: ([x]) => Math.exp(x) }
};

function isIdentifierChar(char) {
  return /[\p{L}\p{N}_.$]/u.test(char);
}

function findColumn(name, columns) {
  const exact = columns.find((column) => column === name);
  if (exact) return exact;
  const normalized = cleanHeader(name).toLowerCase();
  const matches = columns.filter((column) => cleanHeader(column).toLowerCase() === normalized);
  return matches.length === 1 ? matches[0] : "";
}

function tokenize(formula, columns) {
  const tokens = [];
  let index = 0;
  while (index < formula.length) {
    const char = formula[index];
    if (/\s/.test(char)) {
      index += 1;
      continue;
    }

    if ("+-*/^(),".includes(char)) {
      tokens.push({ type: char, value: char });
      index += 1;
      continue;
    }

    if (char === "[") {
      const end = formula.indexOf("]", index + 1);
      if (end < 0) throw new Error("Column reference is missing a closing ].");
      const name = formula.slice(index + 1, end);
      const column = findColumn(name, columns);
      if (!column) throw new Error(`Column [${name}] was not found.`);
      tokens.push({ type: "column", value: column });
      index = end + 1;
      continue;
    }

    const numberMatch = formula.slice(index).match(/^(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
    if (numberMatch) {
      tokens.push({ type: "number", value: Number(numberMatch[0]) });
      index += numberMatch[0].length;
      continue;
    }

    if (isIdentifierChar(char)) {
      let end = index + 1;
      while (end < formula.length && isIdentifierChar(formula[end])) end += 1;
      const name = formula.slice(index, end);
      const lowerName = name.toLowerCase();
      const nextNonSpace = formula.slice(end).match(/^\s*(.)/)?.[1] ?? "";
      if (FUNCTIONS[lowerName] && nextNonSpace === "(") {
        tokens.push({ type: "function", value: lowerName });
      } else {
        const column = findColumn(name, columns);
        if (!column) {
          throw new Error(`Unknown column or function: ${name}. Use [column name] for columns with spaces or symbols.`);
        }
        tokens.push({ type: "column", value: column });
      }
      index = end;
      continue;
    }

    throw new Error(`Unsupported character in formula: ${char}`);
  }

  return tokens;
}

class FormulaParser {
  constructor(tokens) {
    this.tokens = tokens;
    this.position = 0;
  }

  peek() {
    return this.tokens[this.position];
  }

  consume(type) {
    if (this.peek()?.type !== type) return null;
    this.position += 1;
    return this.tokens[this.position - 1];
  }

  expect(type) {
    const token = this.consume(type);
    if (!token) throw new Error(`Expected ${type} in formula.`);
    return token;
  }

  parse() {
    const ast = this.parseAdditive();
    if (this.peek()) throw new Error(`Unexpected token: ${this.peek().value ?? this.peek().type}`);
    return ast;
  }

  parseAdditive() {
    let node = this.parseMultiplicative();
    while (this.peek()?.type === "+" || this.peek()?.type === "-") {
      const operator = this.peek().type;
      this.position += 1;
      node = { type: "binary", operator, left: node, right: this.parseMultiplicative() };
    }
    return node;
  }

  parseMultiplicative() {
    let node = this.parsePower();
    while (this.peek()?.type === "*" || this.peek()?.type === "/") {
      const operator = this.peek().type;
      this.position += 1;
      node = { type: "binary", operator, left: node, right: this.parsePower() };
    }
    return node;
  }

  parsePower() {
    const node = this.parseUnary();
    if (this.peek()?.type === "^") {
      this.position += 1;
      return { type: "binary", operator: "^", left: node, right: this.parsePower() };
    }
    return node;
  }

  parseUnary() {
    if (this.peek()?.type === "+") {
      this.position += 1;
      return this.parseUnary();
    }
    if (this.peek()?.type === "-") {
      this.position += 1;
      return { type: "unary", operator: "-", value: this.parseUnary() };
    }
    return this.parsePrimary();
  }

  parsePrimary() {
    const token = this.peek();
    if (!token) throw new Error("Formula ended unexpectedly.");

    if (this.consume("number")) return { type: "number", value: token.value };
    if (this.consume("column")) return { type: "column", value: token.value };

    if (token.type === "function") {
      this.position += 1;
      this.expect("(");
      const args = [];
      if (this.peek()?.type !== ")") {
        do {
          args.push(this.parseAdditive());
        } while (this.consume(","));
      }
      this.expect(")");
      const signature = FUNCTIONS[token.value];
      if (args.length < signature.min || args.length > signature.max) {
        throw new Error(`${token.value}() expects ${signature.min === signature.max ? signature.min : `${signature.min}+`} argument(s).`);
      }
      return { type: "function", name: token.value, args };
    }

    if (this.consume("(")) {
      const node = this.parseAdditive();
      this.expect(")");
      return node;
    }

    throw new Error(`Unexpected token: ${token.value ?? token.type}`);
  }
}

function collectColumns(ast, output = new Set()) {
  if (ast.type === "column") output.add(ast.value);
  if (ast.left) collectColumns(ast.left, output);
  if (ast.right) collectColumns(ast.right, output);
  if (ast.value && typeof ast.value === "object") collectColumns(ast.value, output);
  if (ast.args) ast.args.forEach((arg) => collectColumns(arg, output));
  return output;
}

export function compileFormula(formula, columns) {
  const trimmed = cleanHeader(formula);
  if (!trimmed) throw new Error("Formula is empty.");
  const tokens = tokenize(trimmed, columns);
  if (!tokens.length) throw new Error("Formula is empty.");
  const ast = new FormulaParser(tokens).parse();
  return {
    formula: trimmed,
    ast,
    referencedColumns: [...collectColumns(ast)]
  };
}

function finiteOrNaN(value) {
  return Number.isFinite(value) ? value : NaN;
}

export function evaluateCompiledFormula(compiled, row) {
  function evaluate(node) {
    if (node.type === "number") return node.value;
    if (node.type === "column") {
      const value = toNumber(row[node.value]);
      return value === null ? NaN : value;
    }
    if (node.type === "unary") {
      const value = evaluate(node.value);
      return finiteOrNaN(node.operator === "-" ? -value : value);
    }
    if (node.type === "binary") {
      const left = evaluate(node.left);
      const right = evaluate(node.right);
      if (!Number.isFinite(left) || !Number.isFinite(right)) return NaN;
      if (node.operator === "+") return finiteOrNaN(left + right);
      if (node.operator === "-") return finiteOrNaN(left - right);
      if (node.operator === "*") return finiteOrNaN(left * right);
      if (node.operator === "/") return right === 0 ? NaN : finiteOrNaN(left / right);
      if (node.operator === "^") return finiteOrNaN(Math.pow(left, right));
    }
    if (node.type === "function") {
      const args = node.args.map(evaluate);
      if (args.some((value) => !Number.isFinite(value))) return NaN;
      return finiteOrNaN(FUNCTIONS[node.name].fn(args));
    }
    return NaN;
  }

  return evaluate(compiled.ast);
}

export function formulaHelpText() {
  return "Use [column name] references. Operators: + - * / ^ and parentheses. Functions: sqrt, abs, pow, min, max, sin, cos, tan, log, exp.";
}
