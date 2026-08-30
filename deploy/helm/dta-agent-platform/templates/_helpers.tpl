{{/* Expand the chart name. */}}
{{- define "dta-agent-platform.name" -}}
{{- default .Chart.Name .Values.nameOverride | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Create a stable, DNS-compatible release name. */}}
{{- define "dta-agent-platform.fullname" -}}
{{- if .Values.fullnameOverride }}
{{- .Values.fullnameOverride | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- $name := default .Chart.Name .Values.nameOverride }}
{{- if contains $name .Release.Name }}
{{- .Release.Name | trunc 63 | trimSuffix "-" }}
{{- else }}
{{- printf "%s-%s" .Release.Name $name | trunc 63 | trimSuffix "-" }}
{{- end }}
{{- end }}
{{- end }}

{{/* Chart name and version used by Helm labels. */}}
{{- define "dta-agent-platform.chart" -}}
{{- printf "%s-%s" .Chart.Name .Chart.Version | replace "+" "_" | trunc 63 | trimSuffix "-" }}
{{- end }}

{{/* Shared Kubernetes labels. */}}
{{- define "dta-agent-platform.labels" -}}
helm.sh/chart: {{ include "dta-agent-platform.chart" . }}
{{ include "dta-agent-platform.selectorLabels" . }}
app.kubernetes.io/version: {{ .Chart.AppVersion | quote }}
app.kubernetes.io/managed-by: {{ .Release.Service }}
{{- end }}

{{/* Immutable selector labels. */}}
{{- define "dta-agent-platform.selectorLabels" -}}
app.kubernetes.io/name: {{ include "dta-agent-platform.name" . }}
app.kubernetes.io/instance: {{ .Release.Name }}
{{- end }}

{{/* ServiceAccount name. */}}
{{- define "dta-agent-platform.serviceAccountName" -}}
{{- if .Values.serviceAccount.create }}
{{- default (include "dta-agent-platform.fullname" .) .Values.serviceAccount.name }}
{{- else }}
{{- default "default" .Values.serviceAccount.name }}
{{- end }}
{{- end }}

{{/* Secret created by the chart or supplied by Vault/External Secrets. */}}
{{- define "dta-agent-platform.secretName" -}}
{{- if .Values.secret.create }}
{{- default (printf "%s-secrets" (include "dta-agent-platform.fullname" .)) .Values.secret.existingSecret }}
{{- else }}
{{- required "secret.existingSecret is required when secret.create=false" .Values.secret.existingSecret }}
{{- end }}
{{- end }}

{{/* Prefer an immutable digest; fall back to an explicit tag. */}}
{{- define "dta-agent-platform.image" -}}
{{- $repository := required "image.repository is required" .Values.image.repository -}}
{{- if .Values.image.digest -}}
{{- printf "%s@%s" $repository .Values.image.digest -}}
{{- else -}}
{{- printf "%s:%s" $repository (default .Chart.AppVersion .Values.image.tag) -}}
{{- end -}}
{{- end }}

{{/* Guard architectural and secret-management invariants. */}}
{{- define "dta-agent-platform.validateValues" -}}
{{- if ne (int .Values.replicaCount) 1 -}}
{{- fail "replicaCount must remain 1 until DTA has distributed session/run ownership" -}}
{{- end -}}
{{- if and .Values.image.digest (not (regexMatch "^sha256:[a-f0-9]{64}$" .Values.image.digest)) -}}
{{- fail "image.digest must be a sha256 digest" -}}
{{- end -}}
{{- if and .Values.networkPolicy.enabled (empty .Values.networkPolicy.ingressFrom) -}}
{{- fail "networkPolicy.ingressFrom is required when NetworkPolicy is enabled" -}}
{{- end -}}
{{- if and .Values.networkPolicy.enabled (empty .Values.networkPolicy.egress.extraRules) -}}
{{- fail "networkPolicy.egress.extraRules must allow company LLM, Keycloak, MinIO, n8n, Postgres/Redis, scanner, speech, and vision endpoints" -}}
{{- end -}}
{{- if and .Values.backupCronJob.enabled (not .Values.persistence.data.enabled) -}}
{{- fail "backupCronJob requires persistence.data.enabled=true" -}}
{{- end -}}
{{- if and .Values.backupCronJob.enabled (not (regexMatch "@sha256:[a-f0-9]{64}$" .Values.backupCronJob.image)) -}}
{{- fail "backupCronJob.image must be pinned by sha256 digest" -}}
{{- end -}}
{{- if .Values.secret.create -}}
{{- range .Values.secret.env -}}
{{- if and (not .optional) (not (hasKey $.Values.secret.values .key)) -}}
{{- fail (printf "secret.values.%s is required because secret.create=true" .key) -}}
{{- end -}}
{{- end -}}
{{- end -}}
{{- end }}
