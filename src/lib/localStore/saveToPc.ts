/**
 * Save a sermon file to the PC. Uses the File System Access API save picker
 * where supported (Chromium desktop/Android), otherwise a plain download.
 * Purely local: nothing is sent to any server.
 */
export type SaveToPcResult = "saved" | "downloaded" | "cancelled";

type SavePicker = (opts: unknown) => Promise<{
  createWritable(): Promise<{ write(data: Blob | string): Promise<void>; close(): Promise<void> }>;
}>;

export async function saveTextToPc(
  text: string,
  suggestedName: string,
  win: Window = window,
): Promise<SaveToPcResult> {
  const blob = new Blob([text], { type: "application/json;charset=utf-8" });
  const picker = (win as unknown as { showSaveFilePicker?: SavePicker }).showSaveFilePicker;
  if (typeof picker === "function") {
    let handle;
    try {
      handle = await picker.call(win, {
        suggestedName,
        types: [{ description: "Sermon file", accept: { "application/json": [".sermon"] } }],
      });
    } catch (err) {
      if ((err as { name?: string })?.name === "AbortError") return "cancelled";
      throw err;
    }
    const w = await handle.createWritable();
    await w.write(blob);
    await w.close();
    return "saved";
  }
  const doc = win.document;
  const url = URL.createObjectURL(blob);
  const a = doc.createElement("a");
  a.href = url;
  a.download = suggestedName;
  doc.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
  return "downloaded";
}
