/// <reference types="vite/client" />
import type { DesktopApi } from "@shared/types/bridge.js";

declare global {
  interface Window {
    api: DesktopApi;
  }
}
