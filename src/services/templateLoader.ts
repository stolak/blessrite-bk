import fs from "fs";
import path from "path";
import * as handlebars from "handlebars";

export interface TemplateData {
  [key: string]: any;
}

export class TemplateLoader {
  private templatesPath: string;
  private compiledTemplates: Map<string, HandlebarsTemplateDelegate> =
    new Map();

  constructor(templatesPath?: string) {
    this.templatesPath =
      templatesPath || path.join(__dirname, "../templates/emailTemplates");
  }

  /**
   * Load and compile a template
   */
  async loadTemplate(
    templateName: string
  ): Promise<HandlebarsTemplateDelegate> {
    // Check if template is already compiled and cached
    if (this.compiledTemplates.has(templateName)) {
      return this.compiledTemplates.get(templateName)!;
    }

    try {
      const templatePath = path.join(
        this.templatesPath,
        `${templateName}.html`
      );

      // Check if file exists
      if (!fs.existsSync(templatePath)) {
        throw new Error(`Template file not found: ${templatePath}`);
      }

      // Read template file
      const templateContent = fs.readFileSync(templatePath, "utf8");

      // Compile template with Handlebars
      const compiledTemplate = handlebars.compile(templateContent);

      // Cache the compiled template
      this.compiledTemplates.set(templateName, compiledTemplate);

      return compiledTemplate;
    } catch (error) {
      console.error(`Error loading template ${templateName}:`, error);
      throw new Error(`Failed to load template: ${templateName}`);
    }
  }

  /**
   * Render a template with data
   */
  async renderTemplate(
    templateName: string,
    data: TemplateData
  ): Promise<string> {
    try {
      const compiledTemplate = await this.loadTemplate(templateName);
      return compiledTemplate(data);
    } catch (error) {
      console.error(`Error rendering template ${templateName}:`, error);
      throw new Error(`Failed to render template: ${templateName}`);
    }
  }

  /**
   * Get list of available templates
   */
  getAvailableTemplates(): string[] {
    try {
      const files = fs.readdirSync(this.templatesPath);
      return files
        .filter((file) => file.endsWith(".html"))
        .map((file) => file.replace(".html", ""));
    } catch (error) {
      console.error("Error reading templates directory:", error);
      return [];
    }
  }

  /**
   * Clear template cache
   */
  clearCache(): void {
    this.compiledTemplates.clear();
  }

  /**
   * Preload all templates
   */
  async preloadAllTemplates(): Promise<void> {
    try {
      const templates = this.getAvailableTemplates();
      const loadPromises = templates.map((template) =>
        this.loadTemplate(template)
      );
      await Promise.all(loadPromises);
      console.log(`Preloaded ${templates.length} email templates`);
    } catch (error) {
      console.error("Error preloading templates:", error);
    }
  }

  /**
   * Get template metadata
   */
  getTemplateMetadata(templateName: string): {
    path: string;
    exists: boolean;
    size?: number;
  } {
    const templatePath = path.join(this.templatesPath, `${templateName}.html`);
    const exists = fs.existsSync(templatePath);
    const stats = exists ? fs.statSync(templatePath) : null;

    return {
      path: templatePath,
      exists,
      size: stats?.size,
    };
  }
}

export const templateLoader = new TemplateLoader();
