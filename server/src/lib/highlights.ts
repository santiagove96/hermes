import Anthropic from '@anthropic-ai/sdk';

export const ALL_HIGHLIGHT_TYPES = [
  'question',
  'suggestion',
  'edit',
  'voice',
  'weakness',
  'evidence',
  'wordiness',
  'factcheck',
  'spoken',
  'intro',
  'outro',
] as const;

export type HighlightType = typeof ALL_HIGHLIGHT_TYPES[number];

export type HighlightData = {
  id: string;
  type: HighlightType;
  matchText: string;
  comment: string;
  suggestedEdit?: string;
};

const HIGHLIGHT_TYPE_DESCRIPTIONS: Record<HighlightType, string> = {
  question: 'unclear intent or asks for clarification',
  suggestion: 'structural or conceptual improvement',
  edit: 'specific text replacement',
  voice: "passage sounds different from the writer's established voice",
  weakness: 'weakest argument or thinnest section',
  evidence: 'where specific examples/data/anecdotes would strengthen',
  wordiness: 'passage could say the same in fewer words',
  factcheck: 'claim that may need citation or could be factually wrong',
  spoken: 'the sentence reads fine but sounds hard to follow aloud in real time',
  intro: 'the opening does not hook the audience quickly enough',
  outro: 'the ending lands weakly and finishes without impact',
};

export function createHighlightTool(allowedTypes: readonly HighlightType[]): Anthropic.Messages.Tool {
  const description = allowedTypes
    .map((type) => `${type} = ${HIGHLIGHT_TYPE_DESCRIPTIONS[type]}`)
    .join(', ');

  return {
    name: 'add_highlight',
    description:
      "Highlight a passage in the writer's text to ask a question, make a suggestion, or propose an edit. " +
      'The matchText MUST be an exact verbatim substring from the document. Use sparingly.',
    input_schema: {
      type: 'object' as const,
      properties: {
        type: {
          type: 'string',
          enum: [...allowedTypes],
          description,
        },
        matchText: {
          type: 'string',
          description:
            'EXACT verbatim substring from the document to highlight. Must match character-for-character.',
        },
        comment: {
          type: 'string',
          description: 'The question, suggestion, or explanation shown to the writer.',
        },
        suggestedEdit: {
          type: 'string',
          description: 'Replacement text. Only provide for type=edit or type=wordiness.',
        },
      },
      required: ['type', 'matchText', 'comment'],
    },
  };
}
