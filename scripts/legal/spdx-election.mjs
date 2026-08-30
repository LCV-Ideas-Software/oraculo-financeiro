export function expressaoTemDisjuncao(no) {
  if (no.license) return false;
  return (
    no.conjunction === "or" ||
    expressaoTemDisjuncao(no.left) ||
    expressaoTemDisjuncao(no.right)
  );
}
