import type { MetadataRoute } from "next";

export default function manifest(): MetadataRoute.Manifest {
  return {
    name: "PotatoFlow",
    short_name: "PotatoFlow",
    description: "把项目计划变成每天能够执行的任务。",
    start_url: "/",
    display: "standalone",
    background_color: "#f7f8f3",
    theme_color: "#1f6a49",
    lang: "zh-CN",
  };
}
