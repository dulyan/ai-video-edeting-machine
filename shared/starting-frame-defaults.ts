export const IMAGE_FIXED_INSTRUCTIONS = `Create one realistic starting-frame image for a casual UGC-style TikTok video.

Use the accompanying unique scene details to determine the specific adult person, appearance, clothing, environment, season, time of day, posture, and captured action. Apply every fixed requirement below.

IMAGE STYLE:
Use the app’s selected aspect ratio.
The image must look like a random paused frame from an ordinary person recording themselves on a smartphone, rather than a professional photograph.
Use realistic consumer-phone video quality: mild compression, slightly imperfect exposure, subtle digital noise, and limited dynamic range.
Skin texture and normal imperfections should remain visible but slightly softened by phone-video compression.
Hair, clothing fibers, jewelry, and small background details should have the natural softness of compressed phone footage.
Avoid artificially crisp pores, individually rendered hair strands, excessive sharpening, skin smoothing, symmetry correction, glamour retouching, cinematic grading, and artificial portrait-mode blur.

CAMERA:
Use a front-facing smartphone selfie viewpoint approximately at eye level and normal conversational selfie distance.
Frame from slightly above the head to approximately the upper chest, with the face roughly centered and a little natural headroom.
Use a believable smartphone wide-angle perspective without obvious distortion.
The framing should feel casual rather than carefully composed. Determine a physically plausible phone position, viewpoint, and background geometry for the chosen environment.
Keep the phone and camera outside the frame. Any visible hand must be anatomically plausible, fit the crop, and be compatible with holding the phone outside the frame.

POSE AND EXPRESSION:
The person is happy, pleasantly surprised, and visibly excited to share something interesting with the viewer, with a gentle closed-lip smile.
The mouth is completely shut. Upper and lower lips gently touch along their full meeting line, with no gap or visible teeth. Lips remain relaxed and natural, not strained or pursed.
Convey surprise and anticipation through engaged eyes, naturally raised eyebrows, subtle cheek expression, head angle, upper-body posture, and a plausible captured action or optional free-hand gesture.
Maintain warm direct engagement with the phone lens. Describe one captured instant, not a sequence of movements.
No parted lips, open-mouth surprise, speech-shaped mouth, gasping, laughing, or speaking. No exaggerated acting, influencer pose, or model pose.

AVATAR GENERATION:
Show one specific, believable fictional adult using the age, gender, and ethnicity in the unique scene details. Translate these into individual visual characteristics rather than repeating labels.
The person is naturally handsome or beautiful, athletic, visibly fit, well groomed, stylish, and affluent, while retaining believable human imperfections.
Make the person look as if they are on their way to the gym. Their clothing, grooming, hairstyle, and any visible accessories must match that situation: stylish, coordinated, practical athletic clothing or gym-ready layers appropriate to the season and weather. Any visible gym bag strap, headphones, or similar detail should feel natural and fit the crop. Keep their appearance believable for heading to a workout rather than a fashion shoot; do not add an accessory unless it fits the scene.
Age should influence facial fullness, face shape, fine lines, skin texture, under-eye appearance, jawline, neck, hair density, hairline, greying, and facial hair where appropriate. Do not exaggerate age or give younger adults automatically flawless skin.
Gender should inform natural presentation, grooming, hairstyle, facial hair where appropriate, and clothing without exaggerated stereotypes.
Ethnicity should inform plausible appearance while respecting broad individual variation. Do not caricature ethnicity or exaggerate racial features.
Use a specific face shape, hairstyle, realistic skin characteristics, small imperfections, coordinated clothing, and one or two distinct personal details appropriate to this person.
Convey style and affluence through quality, fit, materials, grooming, and tasteful details rather than prominent branding, artificial perfection, or glamorous photographic treatment.

BACKGROUND GENERATION:
Use the supplied background details as the foundation for one realistic, lived-in or naturally used, unstaged environment.
Determine a believable part of the room or location, camera position, time-of-day feel, primary light source, light direction, softness, color, and shadow direction.
Lighting must come from a physically plausible source: a window, household fixture, car window, porch light, streetlight, or natural daylight appropriate to the environment. Describe how it falls across the face.
Include two to four meaningful background elements and a few mundane objects that naturally belong there, with small signs of ordinary use or imperfection.
Allow tasteful surroundings without making them showroom-perfect, artificially staged, or cinematic. Keep the background recognizable but slightly soft from ordinary phone focus and video compression.

SCENE CONSISTENCY:
The avatar, clothing, posture, action, camera viewpoint, lighting, season, weather, time of day, and environment must belong to the same physical scene.
Clothing and accessories must suit the setting and conditions. Every visible gesture or action must be physically plausible within the head-to-upper-chest framing.
Any window, lamp, or fixture mentioned must illuminate the person consistently. Do not combine night-time settings with unexplained daylight or contradictory shadows.

UGC REALISM:
Prioritize believable everyday phone footage over visual perfection.
Allow mild facial asymmetry, slightly imperfect posture and framing, normal skin texture, soft shadows, minor exposure imbalance, compression artifacts, and ordinary environmental imperfections.
The viewer should believe this is one frame paused from a longer self-recorded video. Any subtle hand-motion blur must be physically plausible; keep the closed mouth stable and natural.

DO NOT INCLUDE:
No text, captions, subtitles, watermarks, social-media interfaces, borders, logos, readable labels, or readable screen text.
No visible phone or camera, crew reflections, extra people, extra hands or fingers, impossible anatomy, collage, or multiple moments.
No photo-shoot, editorial, fashion-photography, studio-portrait, stock-photo, or polished advertising look.
No ultra-sharp photographic detail, artificial HDR, cinematic grading, unexplained studio lighting, perfect symmetry, heavy blur, or dramatic bokeh.
No skin smoothing, glamour retouching, parted lips, open mouth, visible teeth, or speech-shaped expression.`;

export const IMAGE_PROMPT = `AGE: Automatically chosen specific adult age, with believable age-related features and natural individual variation.
GENDER: Automatically chosen gender and natural presentation, varied between outputs without stereotypes.
ETHNICITY: Automatically chosen ethnicity, with individual appearance and realistic variation rather than stereotyped features.
BACKGROUND: Automatically chosen believable environment, including its specific location, season, time of day, lighting, and naturally present objects.

Other randomized elements: individual facial features, skin characteristics, hairstyle, grooming, clothing, tasteful accessories, distinct character traits, head angle, upper-body posture, emotional intent, and one plausible captured action or free-hand gesture.

Maximum coherent variety across these elements, always within the fixed instructions. Every combination is highly specific, detailed, physically consistent, and realistic. Any ages, genders, ethnicities, locations, or other limits written here constrain the automatic choices.`;
