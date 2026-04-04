# bl delete

> Delete Blaxel resources from your workspace.

## Usage

```
Delete Blaxel resources from your workspace.

WARNING: Deletion is permanent and cannot be undone. Resources are immediately
deactivated and removed along with their configurations.

Two deletion modes:
1. By name: Use subcommands like 'bl delete agent my-agent'
2. By file: Use 'bl delete -f resource.yaml' for declarative management

What Happens:
- Resource is immediately stopped and deactivated
- Configuration and metadata are removed
- Associated logs and metrics may be retained (check workspace policy)
- Data volumes are NOT automatically deleted (use 'bl delete volume')

Before Deleting:
- Backup any important configuration or data
- Check dependencies (other resources using this one)
- Consider stopping instead of deleting for temporary disablement

Note: Deleting an agent/job stops it immediately but may not delete associated
storage volumes. Use 'bl get volumes' to see persistent storage and delete
separately if needed.

Usage:
  bl delete [flags]
  bl delete [command]

Examples:
  # Delete by name (using subcommands)
  bl delete agent my-agent
  bl delete job my-job
  bl delete sandbox my-sandbox

  # Delete multiple resources by name
  bl delete volume vol1 vol2 vol3
  bl delete agent agent1 agent2

  # Delete a sandbox preview
  bl delete sandbox my-sandbox preview my-preview

  # Delete a sandbox preview token
  bl delete sandbox my-sandbox preview my-preview token my-token

  # Delete from YAML file
  bl delete -f my-resource.yaml

  # Delete multiple resources from directory
  bl delete -f ./resources/ -R

  # Delete from stdin (useful in pipelines)
  cat resource.yaml | bl delete -f -

  # Safe deletion workflow
  bl get agent my-agent    # Review resource first
  bl delete agent my-agent # Delete after confirmation

  # --- Bulk deletion with jq filtering ---
  # WARNING: Bulk deletions are irreversible. Always preview first!

  # STEP 1: Preview what would be deleted (ALWAYS DO THIS FIRST)
  bl get jobs -o json | jq -r '.[] | select(.status == "DELETING") | .metadata.name'

  # STEP 2: After verifying the list, proceed with deletion
  bl delete jobs $(bl get jobs -o json | jq -r '.[] | select(.status == "DELETING") | .metadata.name')

  # More bulk deletion examples (always preview first):
  bl delete sandboxes $(bl get sandboxes -o json | jq -r '.[] | select(.status == "FAILED") | .metadata.name')
  bl delete agents $(bl get agents -o json | jq -r '.[] | select(.metadata.name | contains("test")) | .metadata.name')
  bl delete volumes $(bl get volumes -o json | jq -r '.[] | select(.metadata.labels.environment == "dev") | .metadata.name')
  bl delete sandboxes $(bl get sandboxes -o json | jq -r '.[] | select(.metadata.name | test("^temp-")) | .metadata.name')

Available Commands:
  agent                 Delete agent
  drive                 Delete drive
  function              Delete function
  image                 Delete images or image tags
  integrationconnection Delete integrationconnection
  job                   Delete job
  model                 Delete model
  policy                Delete policy
  preview               Delete preview
  previewtoken          Delete previewtoken
  sandbox               Delete sandbox
  volume                Delete volume
  volumetemplate        Delete volumetemplate

Flags:
  -f, --filename string   containing the resource to delete.
  -h, --help              help for delete
  -R, --recursive         Process the directory used in -f, --filename recursively. Useful when you want to manage related manifests organized within the same directory.

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name

Use "bl delete [command] --help" for more information about a command.
```

## Subcommands

### agent

> Delete agent

```
Delete agent

Usage:
  bl delete agent name [name...] [flags]

Aliases:
  agent, agents, ag

Flags:
  -h, --help   help for agent

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### drive

> Delete drive

```
Delete drive

Usage:
  bl delete drive name [name...] [flags]

Aliases:
  drive, drives, drv

Flags:
  -h, --help   help for drive

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### function

> Delete function

```
Delete function

Usage:
  bl delete function name [name...] [flags]

Aliases:
  function, functions, fn, mcp, mcps

Flags:
  -h, --help   help for function

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### image

> Delete container images or specific tags.

```
Delete container images or specific tags.

Usage patterns:
  bl delete image agent/my-image          Delete image with all its tags
  bl delete image agent/my-image:v1.0     Delete only the specified tag

The image reference format is: resourceType/imageName[:tag]
- resourceType: Type of resource (e.g., agent, function, job)
- imageName: The name of the image
- tag: Optional tag to delete only that specific version

WARNING: Deleting an image without specifying a tag will remove ALL tags.

Usage:
  bl delete image [resourceType/]imageName[:tag] ... [flags]

Aliases:
  image, images, img

Examples:
  # Delete an entire image (all tags)
  bl delete image agent/my-agent

  # Delete only a specific tag
  bl delete image agent/my-agent:v1.0

  # Delete multiple images/tags
  bl delete image agent/img1:v1 agent/img2:v2

Flags:
  -h, --help   help for image

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### job

> Delete job

```
Delete job

Usage:
  bl delete job name [name...] [flags]

Aliases:
  job, jobs, jb

Flags:
  -h, --help   help for job

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### model

> Delete model

```
Delete model

Usage:
  bl delete model name [name...] [flags]

Aliases:
  model, models, ml

Flags:
  -h, --help   help for model

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### policy

> Delete policy

```
Delete policy

Usage:
  bl delete policy name [name...] [flags]

Aliases:
  policy, policies, pol

Flags:
  -h, --help   help for policy

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### preview

> Delete preview

```
Delete preview

Usage:
  bl delete preview name [name...] [flags]

Aliases:
  preview, previews, pv

Flags:
  -h, --help   help for preview

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### previewtoken

> Delete previewtoken

```
Delete previewtoken

Usage:
  bl delete previewtoken name [name...] [flags]

Aliases:
  previewtoken, previewtokens, pvt

Flags:
  -h, --help   help for previewtoken

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### sandbox

> Delete sandbox

```
Delete sandbox

Usage:
  bl delete sandbox name [name...] [flags]

Aliases:
  sandbox, sandboxes, sbx

Flags:
  -h, --help   help for sandbox

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### volume

> Delete volume

```
Delete volume

Usage:
  bl delete volume name [name...] [flags]

Aliases:
  volume, volumes, vol

Flags:
  -h, --help   help for volume

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```

### volumetemplate

> Delete volumetemplate

```
Delete volumetemplate

Usage:
  bl delete volumetemplate name [name...] [flags]

Aliases:
  volumetemplate, volumetemplates, vt

Flags:
  -h, --help   help for volumetemplate

Global Flags:
  -o, --output string          Output format. One of: pretty,yaml,json,table
      --skip-version-warning   Skip version warning
  -u, --utc                    Enable UTC timezone
  -v, --verbose                Enable verbose output
  -w, --workspace string       Specify the workspace name
```
