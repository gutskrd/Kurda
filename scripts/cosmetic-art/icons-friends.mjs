/**
 * The shop's animal friends: ten small characters painted in the deer icon's way, colour laid in with dry-brush shade,
 * pale flecks and a soft pencil line. A white rabbit pressing a barbell; a fox in a red cloak resting on its sword; a
 * ginger cat in a hat and boots, paws on its hips; a white kitten with a red bow; a plump blue dove; a sleepy brown bear
 * sitting; a white bear walking; a cow with a bell; a russet hen; and a kiwi probing the earth. Each lives in friends/,
 * one to a file, and is transparent outside its figure, so it reads over a dark profile picture as over a light one.
 *
 * The order is the shop's: icons.mjs numbers their files after the other icons in this order.
 */
import { piece as celek } from './friends/celek.mjs';
import { piece as hirc } from './friends/hirc.mjs';
import { piece as hircaSpi } from './friends/hirca-spi.mjs';
import { piece as kerosk } from './friends/kerosk.mjs';
import { piece as kevokaSin } from './friends/kevoka-sin.mjs';
import { piece as kiwi } from './friends/kiwi.mjs';
import { piece as mirisk } from './friends/mirisk.mjs';
import { piece as pisikCizme } from './friends/pisik-cizme.mjs';
import { piece as pisikQurdele } from './friends/pisik-qurdele.mjs';
import { piece as rovi } from './friends/rovi.mjs';

export const FRIENDS = [kerosk, rovi, pisikCizme, pisikQurdele, kevokaSin, hirc, hircaSpi, celek, mirisk, kiwi];
