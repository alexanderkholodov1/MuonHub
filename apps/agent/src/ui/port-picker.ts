import type { SerialPortInfo, TauriSerialBridge } from "../tauri-serial-bridge.js";

export interface PortPickerOptions {
  bridge: TauriSerialBridge;
  mount: HTMLElement;
}

function renderStatus(element: HTMLElement, message: string): void {
  element.textContent = message;
}

export function renderPortPicker(options: PortPickerOptions): void {
  const { bridge, mount } = options;
  mount.replaceChildren();

  const title = document.createElement("h1");
  title.textContent = "MuonHub Agent serial port";

  const select = document.createElement("select");
  select.setAttribute("aria-label", "Serial port");

  const refreshButton = document.createElement("button");
  refreshButton.type = "button";
  refreshButton.textContent = "Refresh ports";

  const connectButton = document.createElement("button");
  connectButton.type = "button";
  connectButton.textContent = "Connect";

  const status = document.createElement("p");
  renderStatus(status, "Tauri serial scaffold: hardware verification is manual and out of CI.");

  const loadPorts = async (): Promise<void> => {
    renderStatus(status, "Scanning serial ports...");
    const ports = await bridge.listPorts();
    select.replaceChildren(...ports.map((port) => createPortOption(port)));
    renderStatus(status, ports.length === 0 ? "No serial ports found." : "Select a port to connect.");
  };

  refreshButton.addEventListener("click", () => {
    void loadPorts();
  });

  connectButton.addEventListener("click", () => {
    const portName = select.value;
    if (portName.length === 0) {
      renderStatus(status, "Select a serial port first.");
      return;
    }

    void bridge
      .selectPort(portName)
      .then(() => {
        renderStatus(status, `Connected to ${portName}. Incoming lines feed the parser core.`);
      })
      .catch(() => {
        renderStatus(status, `Could not connect to ${portName}. Check OS serial permissions.`);
      });
  });

  mount.append(title, select, refreshButton, connectButton, status);
  void loadPorts();
}

function createPortOption(port: SerialPortInfo): HTMLOptionElement {
  const option = document.createElement("option");
  option.value = port.name;
  option.textContent = port.displayName;
  return option;
}
