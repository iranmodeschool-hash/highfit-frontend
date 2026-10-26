export default function CodeText({ value }: { value: string }) {
  return <span className="code-scroll" dir="ltr" title={value} data-testid="full-code">{value}</span>;
}
