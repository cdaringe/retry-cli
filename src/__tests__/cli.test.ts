import { expect, test } from "vitest";
import { execa } from "execa";
import { setTimeout  } from "node:timers/promises";

const tsxBin = `${process.cwd()}/node_modules/.bin/tsx`;
const cliFilename = `${process.cwd()}/src/bin/cli.ts`;

test("success case", async () => {
  const result = await execa(tsxBin, [cliFilename, "--", "echo", "asdf"]);
  expect(result.stdout).toBe("asdf");
  expect(result.stderr).toBe("");
});
test("retry case", async () => {
  await execa(tsxBin, [cliFilename, "-n", "3", "-t", "100", "--", "ls", "asdf"])
    .then(() => {
      expect.fail("should throw because exit code should be non-zero");
    }, (result) => {
      expect(result.stdout).toBe("");
      const lines = result.stderr.split("\n") as string[];
      const errorLines = lines.filter((line) => line.includes("ls: asdf:"));
      expect(errorLines).toMatchInlineSnapshot(`
        [
          "ls: asdf: No such file or directory",
          "ls: asdf: No such file or directory",
          "ls: asdf: No such file or directory",
          "ls: asdf: No such file or directory",
        ]
      `);
    });
});

test("SIGTERM kills retried process", async () => {
  const { execa } = await import("execa");
  const proc = execa(tsxBin, [
    cliFilename,
    "-n",
    "3",
    "-t",
    "1000",
    "--",
    "sleep",
    "10",
  ]);
  await setTimeout(100);
  proc.kill("SIGTERM");
  await proc
    .then(() => {
      expect.fail("should throw because process was killed");
    }, (_result) => {
      expect(proc.killed).toBe(true);
      expect(proc.exitCode).oneOf([15, 143]);
    });
});

test("can send SIGTERM to child sleep process via CLI", async () => {
  const { execa } = await import("execa");
  // Start the CLI with kill-sleep.sh and capture the PID from stdout
  const proc = execa(tsxBin, [
    cliFilename,
    "-n",
    "1",
    "--",
    "bash",
    "kill-sleep.sh"
  ], {
    cwd: process.cwd(),
    all: true,
    stdout: "pipe",
  });
  let pid: number | undefined;
  proc.stdout?.on("data", (data) => {
    pid = parseInt(data.toString().trim(), 10);
    execa("kill", ["-s", `TERM`, `${pid}`]);
  });
  await proc
    .then(() => {
      expect.fail("should throw because sleep was killed");
    }, (result) => {
      expect(pid).toBeGreaterThan(0);
      expect(result.exitCode).oneOf([15, 128 + 15]);
    });
});
