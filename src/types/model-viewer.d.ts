import "react";

declare module "react" {
  namespace JSX {
    interface IntrinsicElements {
      "model-viewer": React.DetailedHTMLProps<
        React.HTMLAttributes<HTMLElement> & {
          src?: string;
          alt?: string;
          "camera-controls"?: string;
          "auto-rotate"?: string;
          "camera-orbit"?: string;
          "field-of-view"?: string;
          "min-field-of-view"?: string;
          "max-field-of-view"?: string;
          "min-camera-orbit"?: string;
          "max-camera-orbit"?: string;
          "shadow-intensity"?: string;
          exposure?: string;
          poster?: string;
          loading?: "auto" | "lazy" | "eager";
          reveal?: "auto" | "manual";
          ar?: string;
        },
        HTMLElement
      >;
    }
  }
}
