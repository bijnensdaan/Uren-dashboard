import { formatDate, formatHours, formatPercent } from "../utils";

type ReportInput = {
  contractCode: string;
  contractName: string;
  generatedAt: Date;
  inputTotalHours: number;
  lines: Array<{
    profileName: string;
    targetPercentage: number;
    finalHours: number;
  }>;
};

export function buildDeliveryReportHtml(input: ReportInput) {
  const rows = input.lines
    .map(
      (line) => `
        <tr>
          <td>${line.profileName}</td>
          <td>${formatPercent(line.targetPercentage)}</td>
          <td>${formatHours(line.finalHours)}</td>
        </tr>
      `,
    )
    .join("");

  return `
    <article>
      <h1>PV van oplevering</h1>
      <p><strong>Contract:</strong> ${input.contractCode} - ${input.contractName}</p>
      <p><strong>Gegenereerd:</strong> ${formatDate(input.generatedAt)}</p>
      <p><strong>Totaal voorziene uren:</strong> ${formatHours(input.inputTotalHours)}</p>
      <table>
        <thead>
          <tr>
            <th>Profiel</th>
            <th>Doelverdeling</th>
            <th>Finale uren</th>
          </tr>
        </thead>
        <tbody>${rows}</tbody>
      </table>
    </article>
  `;
}
