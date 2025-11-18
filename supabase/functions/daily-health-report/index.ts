// Edge Function: Envio diário de relatórios de Health Score
import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const RESEND_API_KEY = Deno.env.get("RESEND_API_KEY");
const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;

interface ReportData {
  user_email: string;
  user_name: string;
  user_role: string;
  report_date: string;
  summary: {
    total_clients: number;
    avg_score: number;
    distribution: {
      otimo: number;
      estavel: number;
      atencao: number;
      critico: number;
    };
  };
  alerts: {
    new_clients: number;
    new_alerts: number;
    improvements: number;
    declines: number;
    resolved: number;
  };
  priorities: Array<{
    client_name: string;
    health_score: number;
    health_category: string;
    planner: string;
    score_change: number;
  }>;
}

serve(async (req) => {
  try {
    // Validar método
    if (req.method !== "POST") {
      return new Response(JSON.stringify({ error: "Method not allowed" }), {
        status: 405,
        headers: { "Content-Type": "application/json" },
      });
    }

    // Validar API key do Resend
    if (!RESEND_API_KEY) {
      throw new Error("RESEND_API_KEY não configurada");
    }

    // Criar cliente Supabase com service role
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // 1. Buscar todos os usuários de liderança (managers, mediators, leaders)
    // MODO TESTE: Enviando apenas para helio.brollo@braunaplanejamento.com.br
    const { data: users, error: usersError } = await supabase
      .from("user_profiles")
      .select("email, hierarchy_name, role")
      .in("role", ["leader", "mediator", "manager"])
      .eq("email", "helio.brollo@braunaplanejamento.com.br"); // Remove esta linha quando tiver domínio próprio

    if (usersError) {
      throw new Error(`Erro ao buscar usuários: ${usersError.message}`);
    }

    if (!users || users.length === 0) {
      return new Response(
        JSON.stringify({ message: "Nenhum usuário de liderança encontrado" }),
        { status: 200, headers: { "Content-Type": "application/json" } }
      );
    }

    console.log(`📧 Enviando relatórios para ${users.length} usuários...`);

    const results = [];

    // 2. Para cada usuário, gerar relatório e enviar email
    for (const user of users) {
      try {
        // Chamar função SQL para gerar relatório
        const { data: reportData, error: reportError } = await supabase.rpc(
          "get_daily_health_report",
          {
            p_user_email: user.email,
            p_target_date: new Date().toISOString().split("T")[0],
          }
        );

        if (reportError) {
          console.error(`❌ Erro ao gerar relatório para ${user.email}:`, reportError);
          results.push({ email: user.email, status: "error", error: reportError.message });
          continue;
        }

        const report: ReportData = reportData;

        // Gerar HTML do email
        const emailHtml = generateEmailHtml(report);

        // Enviar email via Resend
        const resendResponse = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${RESEND_API_KEY}`,
          },
          body: JSON.stringify({
            from: "Health Score Dashboard <onboarding@resend.dev>",
            to: [user.email],
            subject: `📊 Relatório Diário de Health Score - ${formatDate(report.report_date)}`,
            html: emailHtml,
          }),
        });

        const resendResult = await resendResponse.json();

        if (!resendResponse.ok) {
          console.error(`❌ Erro ao enviar email para ${user.email}:`, resendResult);
          results.push({ email: user.email, status: "error", error: resendResult });
        } else {
          console.log(`✅ Email enviado para ${user.email}`);
          results.push({ email: user.email, status: "success", messageId: resendResult.id });
        }
      } catch (error) {
        console.error(`❌ Erro ao processar ${user.email}:`, error);
        results.push({ email: user.email, status: "error", error: error.message });
      }
    }

    return new Response(
      JSON.stringify({
        message: `Processados ${users.length} usuários`,
        results,
      }),
      { status: 200, headers: { "Content-Type": "application/json" } }
    );
  } catch (error) {
    console.error("❌ Erro geral:", error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { "Content-Type": "application/json" } }
    );
  }
});

// Gerar HTML do email
function generateEmailHtml(report: ReportData): string {
  const roleLabels: Record<string, string> = {
    leader: "Líder",
    mediator: "Mediador",
    manager: "Gerente",
  };

  return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      line-height: 1.6;
      color: #333;
      max-width: 600px;
      margin: 0 auto;
      padding: 20px;
      background-color: #f5f5f5;
    }
    .container {
      background-color: white;
      border-radius: 8px;
      padding: 30px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.1);
    }
    .header {
      border-bottom: 3px solid #2563eb;
      padding-bottom: 20px;
      margin-bottom: 30px;
    }
    h1 {
      color: #1e40af;
      margin: 0 0 10px 0;
      font-size: 24px;
    }
    .subtitle {
      color: #6b7280;
      margin: 0;
      font-size: 14px;
    }
    .section {
      margin-bottom: 30px;
    }
    .section-title {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 15px;
      display: flex;
      align-items: center;
    }
    .stats-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 15px;
      margin-bottom: 20px;
    }
    .stat-card {
      background-color: #f9fafb;
      padding: 15px;
      border-radius: 6px;
      border-left: 4px solid #2563eb;
    }
    .stat-label {
      font-size: 12px;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 0.5px;
      margin-bottom: 5px;
    }
    .stat-value {
      font-size: 24px;
      font-weight: 700;
      color: #1f2937;
    }
    .distribution {
      display: flex;
      gap: 10px;
      margin-top: 10px;
    }
    .dist-item {
      flex: 1;
      text-align: center;
      padding: 10px;
      border-radius: 6px;
      font-size: 14px;
    }
    .dist-otimo { background-color: #dcfce7; color: #166534; }
    .dist-estavel { background-color: #dbeafe; color: #1e40af; }
    .dist-atencao { background-color: #fef3c7; color: #92400e; }
    .dist-critico { background-color: #fee2e2; color: #991b1b; }
    .alert-grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 10px;
    }
    .alert-item {
      background-color: #f9fafb;
      padding: 12px;
      border-radius: 6px;
      display: flex;
      justify-content: space-between;
      align-items: center;
    }
    .alert-label {
      font-size: 13px;
      color: #4b5563;
    }
    .alert-value {
      font-size: 18px;
      font-weight: 700;
      color: #1f2937;
    }
    .priority-list {
      list-style: none;
      padding: 0;
      margin: 0;
    }
    .priority-item {
      background-color: #f9fafb;
      padding: 15px;
      margin-bottom: 10px;
      border-radius: 6px;
      border-left: 4px solid #ef4444;
    }
    .priority-name {
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 5px;
    }
    .priority-details {
      display: flex;
      gap: 15px;
      font-size: 13px;
      color: #6b7280;
    }
    .priority-score {
      font-weight: 600;
      color: #ef4444;
    }
    .footer {
      margin-top: 30px;
      padding-top: 20px;
      border-top: 1px solid #e5e7eb;
      text-align: center;
      color: #6b7280;
      font-size: 12px;
    }
    .no-data {
      text-align: center;
      padding: 20px;
      color: #6b7280;
      font-style: italic;
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📊 Relatório Diário de Health Score</h1>
      <p class="subtitle">
        ${report.user_name} (${roleLabels[report.user_role]}) • ${formatDate(report.report_date)}
      </p>
    </div>

    <!-- RESUMO -->
    <div class="section">
      <div class="section-title">📈 Resumo Geral</div>
      <div class="stats-grid">
        <div class="stat-card">
          <div class="stat-label">Total de Clientes</div>
          <div class="stat-value">${report.summary.total_clients}</div>
        </div>
        <div class="stat-card">
          <div class="stat-label">Média de Score</div>
          <div class="stat-value">${report.summary.avg_score}</div>
        </div>
      </div>

      <div class="distribution">
        <div class="dist-item dist-otimo">
          <strong>${report.summary.distribution.otimo}</strong><br>Ótimo
        </div>
        <div class="dist-item dist-estavel">
          <strong>${report.summary.distribution.estavel}</strong><br>Estável
        </div>
        <div class="dist-item dist-atencao">
          <strong>${report.summary.distribution.atencao}</strong><br>Atenção
        </div>
        <div class="dist-item dist-critico">
          <strong>${report.summary.distribution.critico}</strong><br>Crítico
        </div>
      </div>
    </div>

    <!-- ALERTAS -->
    <div class="section">
      <div class="section-title">🔔 Alertas e Mudanças</div>
      <div class="alert-grid">
        <div class="alert-item">
          <span class="alert-label">Novos Clientes</span>
          <span class="alert-value">${report.alerts.new_clients}</span>
        </div>
        <div class="alert-item">
          <span class="alert-label">Novos Alertas</span>
          <span class="alert-value">${report.alerts.new_alerts}</span>
        </div>
        <div class="alert-item">
          <span class="alert-label">Melhorias</span>
          <span class="alert-value">${report.alerts.improvements}</span>
        </div>
        <div class="alert-item">
          <span class="alert-label">Declínios</span>
          <span class="alert-value">${report.alerts.declines}</span>
        </div>
      </div>
    </div>

    <!-- PRIORIDADES -->
    <div class="section">
      <div class="section-title">⚠️ Top 5 Prioridades</div>
      ${
        report.priorities && report.priorities.length > 0
          ? `
      <ul class="priority-list">
        ${report.priorities
          .map(
            (client) => `
        <li class="priority-item">
          <div class="priority-name">${client.client_name}</div>
          <div class="priority-details">
            <span class="priority-score">Score: ${client.health_score}</span>
            <span>${client.health_category}</span>
            <span>Planejador: ${client.planner}</span>
            ${client.score_change !== 0 ? `<span>Mudança: ${client.score_change > 0 ? "+" : ""}${client.score_change}</span>` : ""}
          </div>
        </li>
        `
          )
          .join("")}
      </ul>
      `
          : '<div class="no-data">Nenhum cliente prioritário no momento</div>'
      }
    </div>

    <div class="footer">
      Este é um relatório automático do Health Score Dashboard.<br>
      Acesse o dashboard para mais detalhes e análises completas.
    </div>
  </div>
</body>
</html>
  `;
}

// Formatar data no padrão brasileiro
function formatDate(dateStr: string): string {
  const date = new Date(dateStr + "T00:00:00");
  return date.toLocaleDateString("pt-BR", {
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
}
