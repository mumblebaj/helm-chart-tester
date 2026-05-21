{{- define "my-chart.name" -}}
{{ .Chart.Name }}
{{- end }}

{{- define "my-chart.fullname" -}}
{{ .Release.Name }}-{{ .Chart.Name }}
{{- end }}