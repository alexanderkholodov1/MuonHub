declare module "plotly.js-dist-min" {
  import type * as Plotly from "plotly.js";

  const PlotlyModule: typeof Plotly;
  export default PlotlyModule;
}

declare module "react-plotly.js/factory" {
  import type { ComponentType } from "react";
  import type * as Plotly from "plotly.js";
  import type { PlotParams } from "react-plotly.js";

  export default function createPlotlyComponent(plotly: typeof Plotly): ComponentType<PlotParams>;
}
