/* ============================================================
   consejeroDetail.ts — ventana de detalle de consejero COMPARTIDA.

   La MISMA ventana sirve para dos acciones, cambiando solo el pie:
     - Colección    -> subir de nivel (MEJORAR)
     - Reclutamiento -> desbloquear con contrato + oro (RECLUTAR)
   Cabecera con retrato + filas de gameplay (habilidad de combate,
   arquetipo de entrenamiento, efecto de run, activación) resueltas
   desde el catálogo compartido por id, y un pie configurable.
   ============================================================ */
import Phaser from 'phaser';
import { COLORS, GAME_W, GAME_H } from './theme.ts';
import { retroPanel, retroButton, titleText, bodyText, portrait, affinityColor } from './widgets.ts';
import { consejeroDef, COMBAT_ABILITIES, RUN_EFFECTS } from '../../shared/sim/index.ts';
import type { Affinity } from '../../shared/types/index.ts';

/** Texto descriptivo de cada arquetipo de entrenamiento (ver decisions/0012). */
export const TRAIN_STYLE_INFO: Record<string, { name: string; desc: string; next: string }> = {
  maestro: {
    name: 'Maestro de Armas',
    desc: 'Polariza el dado: más críticos, pero también más fallos.',
    next: 'Subir nivel ⇒ más bonus de crítico (y dado de ventaja a nivel alto).',
  },
  alquimista: {
    name: 'Alquimista',
    desc: 'Estabiliza: casi nunca falla, pero limita el crítico.',
    next: 'Subir nivel ⇒ entrena con un piso de dado más alto (más estable).',
  },
  intendente: {
    name: 'Intendente',
    desc: 'Eficiencia: reembolsa energía y regala una stat secundaria.',
    next: 'Subir nivel ⇒ más reembolso de energía y stat secundaria.',
  },
};

/** Qué hace cada efecto de run cuando el consejero está activo. */
export const RUN_EFFECT_DESC: Record<string, string> = {
  energiaPrevista: 'Al activarse, reembolsa energía del turno.',
  vinculoFervido: 'Al activarse, gana afinidad (bond) extra.',
  botinDeGuerra: 'En un entrenamiento con éxito, otorga una stat secundaria.',
  segundaIntencion: 'Reduce el riesgo de fallo ese turno.',
  ojoCritico: 'Aumenta la probabilidad de crítico ese turno.',
};

/** Lectura corta del efecto de combate de una habilidad. */
export function abilityEffectText(eff: { type: string; amount?: number; pct?: number }): string {
  switch (eff.type) {
    case 'bonusDamage':
      return `+${eff.amount} daño al atacar`;
    case 'reduceIncoming':
      return `−${eff.amount} daño recibido`;
    case 'blockPct':
      return `bloquea ${Math.round((eff.pct ?? 0) * 100)}% del golpe`;
    case 'ignoreMitigation':
      return 'ignora la mitigación de la defensa rival';
    default:
      return '';
  }
}

/** Etiqueta del perfil de activación según su sesgo. */
export function activationLabel(bias: number): string {
  if (bias >= 0.1) return `Fiable — se activa seguido (+${Math.round(bias * 100)}%)`;
  if (bias <= -0.1) return `Volátil — rara vez activo (${Math.round(bias * 100)}%)`;
  return 'Estándar — sigue la rampa 5%→75%';
}

/** Identidad mínima del consejero para la cabecera. */
export interface ConsejeroModalInfo {
  id: string;
  name: string;
  affinity: Affinity;
  /** Subtítulo bajo el nombre (p. ej. "Nivel 3/10 · Afinidad OFE"). */
  subtitle: string;
}

/** Pie configurable (lo que cambia entre subir nivel y reclutar). */
export interface ConsejeroModalAction {
  /** Línea explicativa (beneficio del próximo nivel / condición de reclutar). */
  hint: string;
  /** Línea de costo/estado grande (dorada si se puede pagar, roja si no). */
  costText: string;
  costColor: number;
  /** Botón primario. */
  primaryLabel: string;
  primaryEnabled: boolean;
  primaryVariant?: 'lime' | 'grey' | 'maroon';
  onPrimary: () => void;
  /** Se llama al cerrar con CERRAR (la escena limpia su referencia). */
  onClose?: () => void;
}

/**
 * Abre la ventana de detalle del consejero. Devuelve el Container para que la
 * escena pueda destruirlo al ejecutar la acción primaria; el botón CERRAR ya
 * lo destruye y notifica vía `action.onClose`.
 */
export function openConsejeroModal(
  scene: Phaser.Scene,
  info: ConsejeroModalInfo,
  action: ConsejeroModalAction
): Phaser.GameObjects.Container {
  // Detalle de gameplay resuelto desde el catálogo compartido por id.
  const def = consejeroDef(info.id);
  const ability = COMBAT_ABILITIES[def.abilityKey];
  const style = TRAIN_STYLE_INFO[def.trainStyle];
  const runEff = def.runEffectId ? RUN_EFFECTS[def.runEffectId] : null;

  const m = scene.add.container(0, 0).setDepth(100);
  const mx = GAME_W / 2;
  const my = GAME_H / 2;
  const panelW = 640;
  const panelH = 880;
  const top = my - panelH / 2;
  const leftX = mx - panelW / 2 + 40;
  const contentW = panelW - 80;

  m.add(scene.add.rectangle(0, 0, GAME_W, GAME_H, 0x0a0806, 0.72).setOrigin(0, 0).setInteractive());
  m.add(retroPanel(scene, mx, my, panelW, panelH, COLORS.panelDark));

  // Cabecera: retrato + nombre + subtítulo.
  m.add(portrait(scene, mx, top + 100, info.id, 108, affinityColor(info.affinity)));
  m.add(titleText(scene, mx, top + 188, info.name, 18, COLORS.cream));
  m.add(bodyText(scene, mx, top + 222, info.subtitle, 15, COLORS.cream));
  m.add(scene.add.rectangle(mx, top + 248, contentW, 2, COLORS.border).setOrigin(0.5));

  // Filas de detalle (cursor vertical, alineadas a la izquierda).
  let ty = top + 268;
  const addRow = (label: string, value: string, valColor: number = COLORS.cream): void => {
    m.add(titleText(scene, leftX, ty, label, 12, COLORS.gold).setOrigin(0, 0));
    ty += 24;
    const v = bodyText(scene, leftX, ty, value, 14, valColor).setOrigin(0, 0);
    v.setWordWrapWidth(contentW, true);
    m.add(v);
    ty += v.height + 14;
  };

  const kindEs = ability?.kind === 'defender' ? 'Defensa' : 'Ataque';
  addRow('HABILIDAD DE COMBATE', ability ? `${ability.ability} · ${kindEs} — ${abilityEffectText(ability.effect)}` : '—');
  addRow('ARQUETIPO DE ENTRENAMIENTO', `${style.name} — ${style.desc}`);
  addRow('EFECTO DE RUN', runEff ? `${runEff.label} — ${RUN_EFFECT_DESC[def.runEffectId!] ?? ''}` : 'Ninguno');
  addRow('ACTIVACIÓN', activationLabel(def.activationBias));

  // Pie configurable: hint + costo + botones.
  m.add(
    bodyText(scene, mx, top + panelH - 196, action.hint, 13, COLORS.cream).setWordWrapWidth(contentW).setAlign('center')
  );
  m.add(titleText(scene, mx, top + panelH - 138, action.costText, 16, action.costColor));
  m.add(
    retroButton(scene, mx - 145, top + panelH - 66, action.primaryLabel, {
      width: 240,
      fontSize: 15,
      variant: action.primaryVariant,
      enabled: action.primaryEnabled,
      onClick: action.onPrimary,
    })
  );
  m.add(
    retroButton(scene, mx + 145, top + panelH - 66, 'CERRAR', {
      variant: 'grey',
      width: 240,
      fontSize: 15,
      onClick: () => {
        m.destroy();
        action.onClose?.();
      },
    })
  );

  return m;
}
