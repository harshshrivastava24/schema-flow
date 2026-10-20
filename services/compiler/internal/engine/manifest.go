// Package engine implements the compiler's manifest loading, template rendering,
// and deterministic ZIP output pipeline.
package engine

import (
	"fmt"
	"os"
	"path/filepath"
	"sort"
	"strings"

	"gopkg.in/yaml.v3"
)

// Manifest represents a target's manifest.yaml configuration.
type Manifest struct {
	Name      string   `yaml:"name"`
	Language  string   `yaml:"language"`
	Databases []string `yaml:"databases"`
	Templates []TemplateEntry `yaml:"templates"`
}

// TemplateEntry describes a single template file within a target.
type TemplateEntry struct {
	Source     string `yaml:"source"`     // template file path relative to target dir
	Output    string `yaml:"output"`     // output path in generated project (may contain {{entity}})
	PerEntity bool   `yaml:"perEntity"`  // if true, rendered once per entity
	Storage   string `yaml:"storage"`    // "postgres", "mongodb", or "" (shared)
	Language  string `yaml:"language"`   // output file language for preview
}

// LoadManifest reads and parses a target's manifest.yaml from the given directory.
func LoadManifest(targetDir string) (*Manifest, error) {
	path := filepath.Join(targetDir, "manifest.yaml")
	data, err := os.ReadFile(path)
	if err != nil {
		return nil, fmt.Errorf("load manifest %s: %w", path, err)
	}

	var m Manifest
	if err := yaml.Unmarshal(data, &m); err != nil {
		return nil, fmt.Errorf("parse manifest %s: %w", path, err)
	}

	return &m, nil
}

// FilterTemplates returns only the templates applicable to the given database,
// sorted by source path for deterministic output.
func (m *Manifest) FilterTemplates(database string) []TemplateEntry {
	var result []TemplateEntry
	for _, t := range m.Templates {
		if t.Storage == "" || t.Storage == database {
			result = append(result, t)
		}
	}
	sort.Slice(result, func(i, j int) bool {
		return result[i].Source < result[j].Source
	})
	return result
}

// SupportsDatabase checks whether the manifest declares support for the given database.
func (m *Manifest) SupportsDatabase(database string) bool {
	for _, db := range m.Databases {
		if strings.EqualFold(db, database) {
			return true
		}
	}
	return false
}
