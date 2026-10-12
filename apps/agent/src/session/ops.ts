/**
 * Operations flowing from the line classifier (stage A: immediate, pure) to the pipeline
 * (stage B: after the raw lines are committed). Session ids are decided in stage A so raw lines are
 * stamped with the session they belong to.
 */
import type { v2 } from "@muonhub/shared";
import type { ParseResult } from "../parsing/parser.js";
import type { RawLineRow } from "../store/types.js";

export type PipelineOp =
  | {
      t: "sessionStart";
      sessionId: string;
      at: number;
      provenance: v2.TimeProvenance;
      synthetic: boolean;
    }
  | { t: "line"; row: RawLineRow; parsed: ParseResult }
  /** A silence longer than the window inside a session (see the aggregator). */
  | { t: "gap" }
  | { t: "sessionEnd"; sessionId: string; at: number; reason: v2.EndReason };
