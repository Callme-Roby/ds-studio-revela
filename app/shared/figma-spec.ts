import { z } from 'zod';

// Description des composants et écrans du DS pour le plugin Figma : géométrie,
// mise en page et styles relevés dans le navigateur, avec pour chaque valeur la
// variable (token) d'origine quand elle est connue. Le plugin la reconstruit en
// nœuds Figma liés aux variables de la collection « Revela · DS-Studio ».

const num = z.number().finite();
const color = z.object({ r: num, g: num, b: num, a: num }).strict();
const ref = <T extends z.ZodTypeAny>(value: T) =>
  z.object({ value, token: z.string().max(40).optional() }).strict();

export const specText = z
  .object({
    kind: z.literal('text'),
    name: z.string().max(80),
    x: num,
    y: num,
    w: num,
    h: num,
    characters: z.string().max(2000),
    fontSize: ref(num),
    fontWeight: num,
    lineHeight: num.optional(),
    letterSpacing: num.optional(),
    color: ref(color),
    align: z.enum(['LEFT', 'CENTER', 'RIGHT']),
    absolute: z.boolean().optional(),
  })
  .strict();

export type SpecText = z.infer<typeof specText>;
export type SpecFrame = {
  kind: 'frame';
  name: string;
  x: number;
  y: number;
  w: number;
  h: number;
  fill?: { value: z.infer<typeof color>; token?: string };
  stroke?: { value: z.infer<typeof color>; token?: string; weight: number };
  radius?: { value: number; token?: string };
  opacity?: number;
  clip?: boolean;
  absolute?: boolean;
  layout?: {
    mode: 'HORIZONTAL' | 'VERTICAL';
    gap: { value: number; token?: string };
    padding: { value: number; token?: string }[];
    align: 'MIN' | 'CENTER' | 'MAX';
    justify: 'MIN' | 'CENTER' | 'MAX' | 'SPACE_BETWEEN';
    hug: boolean;
  };
  instance?: { component: string; variant: string };
  children: (SpecFrame | SpecText)[];
};
export const specFrame: z.ZodType<SpecFrame> = z.lazy(() =>
  z
    .object({
      kind: z.literal('frame'),
      name: z.string().max(80),
      x: num,
      y: num,
      w: num,
      h: num,
      fill: ref(color).optional(),
      stroke: z
        .object({
          value: color,
          token: z.string().max(40).optional(),
          weight: num,
        })
        .strict()
        .optional(),
      radius: ref(num).optional(),
      opacity: num.optional(),
      clip: z.boolean().optional(),
      absolute: z.boolean().optional(),
      layout: z
        .object({
          mode: z.enum(['HORIZONTAL', 'VERTICAL']),
          gap: ref(num),
          padding: z.array(ref(num)).length(4),
          align: z.enum(['MIN', 'CENTER', 'MAX']),
          justify: z.enum(['MIN', 'CENTER', 'MAX', 'SPACE_BETWEEN']),
          hug: z.boolean(),
        })
        .strict()
        .optional(),
      instance: z
        .object({ component: z.string().max(40), variant: z.string().max(120) })
        .strict()
        .optional(),
      children: z.array(z.union([specFrame, specText])).max(400),
    })
    .strict(),
) as z.ZodType<SpecFrame>;

export const figmaSpecSchema = z
  .object({
    version: z.literal(1),
    revision: z.number().int().nonnegative(),
    codeRevision: z.number().int().nonnegative(),
    date: z.string().max(40),
    components: z
      .array(
        z
          .object({
            name: z.string().max(40),
            group: z.string().max(40),
            description: z.string().max(300),
            variants: z
              .array(
                z
                  .object({ variant: z.string().max(120), node: specFrame })
                  .strict(),
              )
              .min(1)
              .max(20),
          })
          .strict(),
      )
      .max(60),
    screens: z
      .array(
        z
          .object({
            name: z.string().max(80),
            width: num,
            height: num,
            node: specFrame,
          })
          .strict(),
      )
      .max(10),
  })
  .strict();
export type FigmaSpec = z.infer<typeof figmaSpecSchema>;
