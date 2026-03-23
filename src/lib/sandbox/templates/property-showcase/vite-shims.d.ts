declare module "@tailwindcss/vite" {
  const tailwindcss: () => any;
  export default tailwindcss;
}

declare module "@vitejs/plugin-react" {
  const react: () => any;
  export default react;
}

declare module "vite-plugin-singlefile" {
  export function viteSingleFile(): any;
}
