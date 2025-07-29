#!/usr/bin/env node
import retry from "retry";
import spawn from "cross-spawn";
import Getopt from "node-getopt";

const getopt = new Getopt([
  [
    "n",
    "retries=ARG",
    "Maximum amount of times to retry the operation. (default: 10)",
  ],
  ["", "factor=ARG", "Exponential factor to use. (default: 2)"],
  [
    "t",
    "min-timeout=ARG",
    "Number of milliseconds before starting the first retry. (default: 1000)",
  ],
  [
    "",
    "max-timeout=ARG",
    "Maximum number of milliseconds between two retries. (default: Infinity)",
  ],
  [
    "",
    "randomize",
    "Randomizes the timeouts by multiplying with a factor between 1 to 2.",
  ],
  ["h", "help", "Display this help."],
]);

getopt.setHelp(
  "Usage: retry [OPTION] -- [COMMAND]\n" +
    "\n" +
    "[[OPTIONS]]\n" +
    "\n" +
    "Examples:\n" +
    "retry -- ls -lah dir\n" +
    "retry -n 3 -t 100 -- ls asdf",
);

const opt = getopt.parse(process.argv);

const cmd = opt.argv.slice(2);

if (!cmd[0]) {
  getopt.showHelp();
  process.exit();
}

const toInt = (value: unknown, defaultValue: number): number => {
  if (value == null) {
    return defaultValue;
  }
  if (typeof value === "number") {
    return value;
  }
  const intValue = parseInt(String(value), 10);
  if (isNaN(intValue)) {
    throw new Error(`Invalid integer value: ${value}`);
  }
  return intValue;
};

const operation = retry.operation({
  retries: toInt(opt.options["retries"], 10),
  factor: toInt(opt.options["factor"], 2),
  minTimeout: toInt(opt.options["min-timeout"], 1000),
  maxTimeout: toInt(opt.options["max-timeout"], Infinity),
  randomize: !!opt.options["randomize"],
});


operation.attempt(function onAttempt(currentAttempt) {
  const child = spawn(cmd[0], cmd.slice(1), { stdio: "inherit" });

  child.on("exit", (code, signal) => {
    if (code === 0) {
      return;
    }

    const isRetrying = operation.retry(
      new Error(`attempt: ${currentAttempt} failed with code: ${code}`),
    );
    if (isRetrying) return;

    if (signal) {
      process.kill(process.pid, signal);
    } else {
      process.exit(code ?? 1);
    }
  });

  // https://nodejs.org/api/child_process.html#event-error
  child.on("error", (err) => {
    const isRetrying = operation.retry(err);
    if (!isRetrying) {
      process.exit(1);
    }
  });
});
