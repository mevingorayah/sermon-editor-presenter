import type { DirHandleLike, FileHandleLike, PermissionStateLike } from "../fsTypes";

function domErr(name: string): Error {
  const e = new Error(name);
  e.name = name;
  return e;
}

/** In-memory File System Access mock. */
export class MemoryDir implements DirHandleLike {
  kind = "directory" as const;
  files = new Map<string, string>();
  gone = false;
  failWrite: string | null = null;
  permission: PermissionStateLike = "granted";
  constructor(public name = "Sermons") {}

  private check() {
    if (this.gone) throw domErr("NotFoundError");
    if (this.permission !== "granted") throw domErr("NotAllowedError");
  }

  async getFileHandle(name: string, opts?: { create?: boolean }): Promise<FileHandleLike> {
    this.check();
    if (!this.files.has(name)) {
      if (!opts?.create) throw domErr("NotFoundError");
      this.files.set(name, "");
    }
    return {
      kind: "file",
      name,
      getFile: async () => {
        this.check();
        const t = this.files.get(name);
        if (t === undefined) throw domErr("NotFoundError");
        return { text: async () => t };
      },
      createWritable: async () => {
        this.check();
        let buf = "";
        return {
          write: async (d: string) => {
            buf += d;
          },
          close: async () => {
            if (this.failWrite) throw domErr(this.failWrite);
            this.check();
            this.files.set(name, buf);
          },
          abort: async () => {},
        };
      },
    };
  }

  async removeEntry(name: string) {
    this.check();
    if (!this.files.delete(name)) throw domErr("NotFoundError");
  }

  async *values() {
    this.check();
    for (const name of [...this.files.keys()]) yield await this.getFileHandle(name);
  }

  async queryPermission() {
    return this.permission;
  }
  async requestPermission() {
    return this.permission;
  }
}

export class MemoryKV {
  m = new Map<string, string>();
  quota = Infinity;
  getItem(k: string) {
    return this.m.get(k) ?? null;
  }
  setItem(k: string, v: string) {
    if (v.length > this.quota) throw domErr("QuotaExceededError");
    this.m.set(k, v);
  }
  removeItem(k: string) {
    this.m.delete(k);
  }
}
