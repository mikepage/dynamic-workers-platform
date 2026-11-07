export const Counter = ({ start }: { start: number }) => (
  <ul>
    {Array.from({ length: start }, (_, i) => (
      <li>item {i + 1}</li>
    ))}
  </ul>
);
