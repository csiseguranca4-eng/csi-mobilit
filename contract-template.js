// contract-template.js - Texto e PDF corporativo CSI Mobility
function gerarTextoContrato(dadosMissao) {
    const valorTotal = Number(dadosMissao.valorTotal || 1770.00);
    const valorSinal = (valorTotal * 0.5).toFixed(2);
    const numeroProtocolo = dadosMissao.protocolo || "18D45819";
    const pixKey = dadosMissao.pixKey || "00.000.000/0001-00";
    const pixPayload = dadosMissao.pixPayload || "";
    const origem = dadosMissao.origemCompleta || dadosMissao.origem || "Brasília";
    const destino = dadosMissao.destinoCompleto || dadosMissao.destino || "Goiânia";

    return `
CONTRATO PARTICULAR DE PRESTAÇÃO DE SERVIÇOS DE SEGURANÇA E MOBILIDADE EXECUTIVA
CONTRATO Nº: ${numeroProtocolo}

CONTRATANTE: ${dadosMissao.nomeCliente || "[Nome do Cliente]"}, inscrito(a) no CPF/CNPJ sob o nº ${dadosMissao.cpfCliente || "[Inserir CPF]"}, com endereço em ${dadosMissao.endereco || "[Inserir Endereço]"}.
CONTRATADA: INTERNATIONAL SECURITY CONSULTING (CSI MOBILITY), especializada em segurança e mobilidade executiva, com sede em Goiânia/GO.

As partes acima qualificadas celebram o presente contrato, que se regerá pelas cláusulas seguintes e pelas condições de segurança aplicáveis:

CLÁUSULA PRIMEIRA – DO OBJETO
O presente contrato tem por objeto a prestação de serviços de segurança e transporte executivo, conforme especificações da missão solicitada:
- Tipo de Serviço: ${dadosMissao.servico || "Escolta VIP"}
- Origem: ${origem}
- Destino: ${destino}
- Data e Horário: ${dadosMissao.data || "20/10/2026"} às ${dadosMissao.horario || "09:00"}
- Perfil de Segurança / Vestuário: ${dadosMissao.perfilSeguridad || "Motorista Desarmado"} / ${dadosMissao.vestuario || "Terno Completo"}
- Veículo: ${dadosMissao.veiculo || "Veículo do operador CSI"} · Placa ${dadosMissao.placa || "[Placa]"}
- Operador alocado: ${dadosMissao.operador || "A definir pelo comando"} (CPF ${dadosMissao.cpfOperador || "[CPF do operador]"})
- Praça do operador: ${dadosMissao.pracaOperador || "A definir"}

CLÁUSULA SEGUNDA – DO VALOR E DA CONDIÇÃO DE PAGAMENTO (SINAL DE 50%)
1. O valor total acordado para a execução da missão é de R$ ${valorTotal.toFixed(2)}.
2. Como condição indispensável para a validação e o agendamento definitivo da missão, o CONTRATANTE deverá efetuar o pagamento antecipado de sinal correspondente a 50% do valor total, no montante de R$ ${valorSinal}, via PIX.
3. O restante do pagamento deverá ser quitado conforme as diretrizes operacionais da CONTRATADA.

[ DADOS DE PAGAMENTO PIX - SINAL 50% ]
Chave PIX: ${pixKey} (CSI Security Consulting)
Valor do Pix: R$ ${valorSinal}
Copia e cola PIX:
${pixPayload || "(QR Code e copia-e-cola gerados no painel do cliente)"}

CLÁUSULA TERCEIRA – DA ASSINATURA DIGITAL E EFETIVAÇÃO
1. Este contrato deverá ser assinado digitalmente pelo CONTRATANTE através da plataforma oficial do Governo Federal (Gov.br) e reencaminhado na plataforma da CSI Mobility juntamente com o comprovativo do sinal.
2. A missão apenas será considerada "Agendada e Liberada" após a validação do contrato assinado e do sinal financeiro pela mesa de comandos da CONTRATADA.

E por estarem justos e contratados, assinam o presente instrumento digitalmente.

Goiânia - GO, ${new Date().toLocaleDateString("pt-BR")}
    `;
}

async function carregarLogoCsi() {
    if (carregarLogoCsi.cache) return carregarLogoCsi.cache;
    try {
        const res = await fetch("./logo-csi.png");
        const blob = await res.blob();
        const dataUrl = await new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result);
            reader.onerror = reject;
            reader.readAsDataURL(blob);
        });
        carregarLogoCsi.cache = dataUrl;
        return dataUrl;
    } catch {
        return "";
    }
}

async function gerarContratoPdf(dadosMissao) {
    if (!window.jspdf?.jsPDF) {
        throw new Error("Biblioteca PDF indisponível.");
    }
    const doc = new window.jspdf.jsPDF({ unit: "mm", format: "a4" });
    const valorTotal = Number(dadosMissao.valorTotal || 0);
    const valorSinal = (valorTotal * 0.5).toFixed(2);
    const protocolo = dadosMissao.protocolo || "CSI";
    const pageW = doc.internal.pageSize.getWidth();
    const margin = 16;
    let y = 14;

    const logo = dadosMissao.logoDataUrl || (await carregarLogoCsi());
    if (logo) {
        try {
            doc.addImage(logo, "PNG", margin, 10, 18, 18);
        } catch {
            /* logo opcional */
        }
    }

    doc.setFont("helvetica", "bold");
    doc.setFontSize(13);
    doc.setTextColor(11, 15, 25);
    doc.text("INTERNATIONAL SECURITY CONSULTING", margin + 22, 17);
    doc.setFontSize(9);
    doc.setTextColor(220, 38, 38);
    doc.text("CSI MOBILITY  ·  SEGURANÇA E TRANSPORTE EXECUTIVO", margin + 22, 23);
    doc.setDrawColor(220, 38, 38);
    doc.setLineWidth(0.6);
    doc.line(margin, 32, pageW - margin, 32);

    y = 40;
    doc.setTextColor(11, 15, 25);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(14);
    doc.text("Contrato de Prestação de Serviços", margin, y);
    y += 7;
    doc.setFontSize(10);
    doc.setTextColor(30, 58, 138);
    doc.text(`Contrato nº ${protocolo}`, margin, y);
    y += 10;

    const row = (label, value) => {
        doc.setFont("helvetica", "bold");
        doc.setFontSize(8);
        doc.setTextColor(100, 116, 139);
        doc.text(String(label).toUpperCase(), margin, y);
        y += 4.2;
        doc.setFont("helvetica", "normal");
        doc.setFontSize(10);
        doc.setTextColor(15, 23, 42);
        const lines = doc.splitTextToSize(String(value || "—"), pageW - margin * 2);
        doc.text(lines, margin, y);
        y += lines.length * 5 + 2;
    };

    row("Contratante", `${dadosMissao.nomeCliente || "—"} · CPF/CNPJ ${dadosMissao.cpfCliente || "—"}`);
    row("Contratada", "International Security Consulting (CSI Mobility) · Goiânia/GO");
    row("Objeto / serviço", dadosMissao.servico || "Mobilidade executiva");
    row("Origem", dadosMissao.origemCompleta || dadosMissao.origem || "—");
    row("Destino", dadosMissao.destinoCompleto || dadosMissao.destino || "—");
    row("Data e horário", `${dadosMissao.data || "—"} às ${dadosMissao.horario || "—"}`);
    row("Perfil / vestuário", `${dadosMissao.perfilSeguridad || "—"} / ${dadosMissao.vestuario || "—"}`);
    row("Veículo", `${dadosMissao.veiculo || "—"} · Placa ${dadosMissao.placa || "—"}`);
    row("Operador alocado", `${dadosMissao.operador || "—"} · CPF ${dadosMissao.cpfOperador || "—"} · ${dadosMissao.pracaOperador || ""}`);
    row("Valor total", `R$ ${valorTotal.toFixed(2)}`);
    row("Sinal de 50% via Pix", `R$ ${valorSinal} · Chave ${dadosMissao.pixKey || "—"}`);

    if (dadosMissao.qrDataUrl) {
        try {
            doc.addImage(dadosMissao.qrDataUrl, "PNG", pageW - margin - 38, y - 4, 36, 36);
        } catch {
            /* QR opcional */
        }
    }

    y += 8;
    doc.setFont("helvetica", "bold");
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("COPIA E COLA PIX", margin, y);
    y += 5;
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7);
    doc.setTextColor(15, 23, 42);
    const pixLines = doc.splitTextToSize(dadosMissao.pixPayload || "Gerado no painel do cliente.", pageW - margin * 2 - 42);
    doc.text(pixLines, margin, y);
    y += Math.max(pixLines.length * 3.4, 28);

    doc.setFontSize(8);
    doc.setTextColor(71, 85, 105);
    const clause = doc.splitTextToSize(
        "Este contrato deverá ser assinado digitalmente pelo CONTRATANTE via Gov.br e reenviado na plataforma CSI Mobility com o comprovativo do sinal. A missão só será considerada agendada e liberada após validação do comando.",
        pageW - margin * 2
    );
    doc.text(clause, margin, y);
    y += clause.length * 4 + 10;
    doc.setFont("helvetica", "italic");
    doc.text(`Goiânia - GO, ${new Date().toLocaleDateString("pt-BR")}`, margin, y);

    doc.save(`contrato-csi-${protocolo}.pdf`);
    return doc;
}
