import type * as pty from "node-pty";

interface DialogHandler {
  trigger: string;
  keystroke: string;
  fired: boolean;
}

export class DialogGuard {
  private handlers: DialogHandler[] = [];
  private disposable: { dispose(): void } | undefined;

  addHandler(trigger: string, keystroke: string): void {
    this.handlers.push({ trigger, keystroke, fired: false });
  }

  attach(ptyProcess: pty.IPty): void {
    this.disposable = ptyProcess.onData((data: string) => {
      for (const handler of this.handlers) {
        if (!handler.fired && data.includes(handler.trigger)) {
          handler.fired = true;
          console.error(
            `[tfh-debug] dialog match trigger=${JSON.stringify(handler.trigger)} ` +
            `send=${JSON.stringify(handler.keystroke)}`,
          );
          ptyProcess.write(handler.keystroke);
        }
      }
    });
  }

  deactivate(): void {
    this.disposable?.dispose();
    this.disposable = undefined;
    this.handlers = [];
  }
}
