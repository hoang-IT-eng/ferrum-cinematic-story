/**
 * Story narrative, calculations, and 12-week workout data for FERRUM.
 * All copy is original Vietnamese authoring focused on a natural hardgainer journey.
 */

export interface FilmSceneBeat {
  id: string
  index: number
  roman: string
  shortLabel: string
  line: string
  body: string
}

export const HERO_COPY = {
  headlineTop: 'GẦY NHƯ QUE CỦI.',
  headlineBottom: 'Họ cười. Họ chỉ trỏ.',
  subhead:
    'Và cậu chỉ biết cúi đầu bước đi. Cho đến ngày cậu ngừng tập theo cảm tính để bước vào một kỷ luật có thể đo lường từng gram và từng kilogram.',
  ctaAudio: 'Bước vào · Bật âm thanh',
  ctaSilent: 'Xem im lặng',
  hint: 'Cuộn xuống hoặc chọn để mở màn',
} as const

export const FILM_SCENES: FilmSceneBeat[] = [
  {
    id: 'scene-1',
    index: 0,
    roman: 'I',
    shortLabel: 'Chỉ trỏ',
    line: 'Những tiếng cười sau lưng nặng hơn cả tạ.',
    body: 'Áo size S vẫn thùng thình trên bờ vai xuôi. Bạn bè vây quanh cười cợt, chỉ tay vào đôi vai khẳng khiu — vết xước lòng tự trọng biến thành lời thề im lặng trong bóng tối.',
  },
  {
    id: 'scene-2',
    index: 1,
    roman: 'II',
    shortLabel: 'Bế tắc',
    line: 'Mồ hôi đổ xuống, nhưng cân nặng vẫn khóa cứng ở 52 kg.',
    body: 'Tám tháng lao vào phòng gym theo cảm tính, vắt kiệt sức trước chiếc gương nứt mà không ghi chép mức tạ, không kiểm soát calo thặng dư. Tháng nào cũng mệt, mà hình bóng trong gương chẳng đổi.',
  },
  {
    id: 'scene-3',
    index: 2,
    roman: 'III',
    shortLabel: 'Mở App',
    line: 'Khoảnh khắc ngừng tập mù — mở dữ liệu dẫn đường.',
    body: 'Ngồi lặng trên băng ghế phòng tập, cậu mở FERRUM. Ánh sáng kỹ thuật tính chính xác mức thặng dư +350 kcal sạch và phác đồ tăng tải lũy tiến từng buổi — bóng tối bắt đầu tan.',
  },
  {
    id: 'scene-4',
    index: 3,
    roman: 'IV',
    shortLabel: 'Bứt phá',
    line: 'Tăng tải lũy tiến từng 1.25 kg. Nghiền nát giới hạn cũ.',
    body: 'Không còn nâng bừa theo hứng. Từng hiệp Bench, Squat, Row được kiểm soát chuẩn xác từng mức RPE và gram đạm — nội lực bùng nổ phá vỡ xiềng xích cũ.',
  },
  {
    id: 'scene-5',
    index: 4,
    roman: 'V',
    shortLabel: 'Lột xác',
    line: 'Không còn cúi đầu. Cơ thể do chính kỷ luật của mình rèn nên.',
    body: 'Sau 180 ngày kỷ luật tuyệt đối: 64.5 kg nạc săn chắc, bờ vai rộng vững chãi bước lên từng bậc thang ánh sáng. Người từng bị chỉ trỏ năm nào giờ tự viết lấy chuẩn mực của mình.',
  },
]

export const TURNING_POINT = {
  headline: 'Ngừng tập mù. Hãy để dữ liệu dẫn đường cho từng hiệp tạ.',
  lead: 'FERRUM được thiết kế riêng cho người gầy khó tăng cân (hardgainer), biến mọi buổi tập cảm tính thành một hệ thống tăng cơ đo lường được.',
  pillars: [
    {
      index: 'I',
      title: 'Tăng tải Lũy tiến Tự động (Auto Overload)',
      desc: 'FERRUM ghi nhớ mức tạ và số rep buổi trước của bạn, tự động tính mức tạ cần tăng (+1.25 đến +2.5 kg) hoặc rep mục tiêu cho buổi hôm nay để cơ bắt buộc phải phát triển.',
    },
    {
      index: 'II',
      title: 'Dinh dưỡng Thặng dư Đích thực cho Người Gầy',
      desc: 'Không ăn thừa mỡ vô ích. Thuật toán tính chính xác mức thặng dư +350 kcal trên TDEE thực, chia rõ từng gram Đạm (2.0g/kg), Tinh bột và Béo.',
    },
    {
      index: 'III',
      title: 'Khống chế Khối lượng Tập Chống Cháy Cơ',
      desc: 'Người gầy tập quá nhiều bài rác sẽ bị quá tải hồi phục. FERRUM ưu tiên 4–5 bài đa khớp cốt lõi mỗi buổi với giới hạn RPE khoa học.',
    },
  ],
} as const

export interface BlueprintInput {
  weightKg: number
  heightCm: number
  daysPerWeek: 3 | 4 | 5
  benchKg: number
}

export interface BlueprintResult {
  bmr: number
  tdee: number
  targetCalories: number
  proteinG: number
  fatG: number
  carbG: number
  projectedGain12W: number
  projectedBench12W: number
  splitTitle: string
  weekOneSample: {
    day: string
    focus: string
    exercises: { name: string; setsReps: string; loadKg: string; rpe: string }[]
  }[]
  weeklyWeights: number[]
}

function roundToQuarter(kg: number): number {
  return Math.max(2.5, Math.round(kg / 2.5) * 2.5)
}

export function computeFerrumBlueprint(input: BlueprintInput): BlueprintResult {
  const { weightKg, heightCm, daysPerWeek, benchKg } = input
  // Mifflin-St Jeor (age baseline 21) with gym-activity factor scaled cleanly by days/week
  const bmr = Math.round(10 * weightKg + 6.25 * heightCm - 5 * 21 + 5)
  const activityMult = daysPerWeek === 3 ? 1.48 : daysPerWeek === 4 ? 1.58 : 1.68
  const tdee = Math.round(bmr * activityMult)
  const targetCalories = tdee + 350

  const proteinG = Math.round(weightKg * 2.0)
  const fatG = Math.round(weightKg * 0.9)
  const carbG = Math.max(120, Math.round((targetCalories - proteinG * 4 - fatG * 9) / 4))

  // Realistic beginner-hardgainer progression over 12 weeks (~0.32 - 0.38 kg/week lean bias)
  const weeklyGainRate = daysPerWeek === 3 ? 0.31 : daysPerWeek === 4 ? 0.36 : 0.4
  const projectedGain12W = Number((weeklyGainRate * 12).toFixed(1))
  const projectedBench12W = roundToQuarter(benchKg + 15 + (daysPerWeek - 3) * 2.5)

  const squatEst = roundToQuarter(benchKg * 1.25 + 10)
  const deadliftEst = roundToQuarter(benchKg * 1.45 + 15)
  const ohpEst = roundToQuarter(benchKg * 0.65)
  const rowEst = roundToQuarter(benchKg * 0.95)

  const weeklyWeights = Array.from({ length: 13 }, (_, w) =>
    Number((weightKg + weeklyGainRate * w).toFixed(1)),
  )

  if (daysPerWeek === 3) {
    return {
      bmr,
      tdee,
      targetCalories,
      proteinG,
      fatG,
      carbG,
      projectedGain12W,
      projectedBench12W,
      splitTitle: '3 Buổi / Tuần · Toàn Thân Tối Ưu Hồi Phục (Full Body A/B)',
      weeklyWeights,
      weekOneSample: [
        {
          day: 'Thứ Hai · Ngày A',
          focus: 'Khung lực Ngực · Đùi trước · Lưng ngang',
          exercises: [
            { name: 'Barbell Squat', setsReps: '3 × 6–8', loadKg: `${squatEst} kg`, rpe: 'RPE 7.5' },
            { name: 'Flat Barbell Bench Press', setsReps: '3 × 6–8', loadKg: `${roundToQuarter(benchKg)} kg`, rpe: 'RPE 8' },
            { name: 'Pendlay Barbell Row', setsReps: '3 × 8–10', loadKg: `${rowEst} kg`, rpe: 'RPE 8' },
          ],
        },
        {
          day: 'Thứ Tư · Ngày B',
          focus: 'Vai đứng · Chuỗi cơ sau · Kéo xô',
          exercises: [
            { name: 'Romanian Deadlift', setsReps: '3 × 8–10', loadKg: `${deadliftEst} kg`, rpe: 'RPE 7.5' },
            { name: 'Overhead Press', setsReps: '3 × 6–8', loadKg: `${ohpEst} kg`, rpe: 'RPE 8' },
            { name: 'Lat Pulldown / Pull-up', setsReps: '3 × 8–12', loadKg: `${roundToQuarter(weightKg * 0.8)} kg`, rpe: 'RPE 8.5' },
          ],
        },
      ],
    }
  }

  if (daysPerWeek === 4) {
    return {
      bmr,
      tdee,
      targetCalories,
      proteinG,
      fatG,
      carbG,
      projectedGain12W,
      projectedBench12W,
      splitTitle: '4 Buổi / Tuần · Thân Trên / Thân Dưới (Upper / Lower)',
      weeklyWeights,
      weekOneSample: [
        {
          day: 'Buổi 1 · Upper Power',
          focus: 'Phát triển Độ Dày Ngực · Lưng · Vai Trước',
          exercises: [
            { name: 'Barbell Bench Press', setsReps: '4 × 6–8', loadKg: `${roundToQuarter(benchKg)} kg`, rpe: 'RPE 8' },
            { name: 'Chest-Supported Row', setsReps: '4 × 8–10', loadKg: `${rowEst} kg`, rpe: 'RPE 8' },
            { name: 'Overhead Dumbbell Press', setsReps: '3 × 8–10', loadKg: `${ohpEst} kg`, rpe: 'RPE 8' },
          ],
        },
        {
          day: 'Buổi 2 · Lower Foundation',
          focus: 'Sức Mạnh Đùi · Mông · Cốt Lõi',
          exercises: [
            { name: 'Back Squat', setsReps: '4 × 6–8', loadKg: `${squatEst} kg`, rpe: 'RPE 7.5' },
            { name: 'Romanian Deadlift', setsReps: '3 × 8–10', loadKg: `${deadliftEst} kg`, rpe: 'RPE 8' },
            { name: 'Standing Calf Raise', setsReps: '4 × 12–15', loadKg: `${roundToQuarter(weightKg * 0.9)} kg`, rpe: 'RPE 9' },
          ],
        },
      ],
    }
  }

  return {
    bmr,
    tdee,
    targetCalories,
    proteinG,
    fatG,
    carbG,
    projectedGain12W,
    projectedBench12W,
    splitTitle: '5 Buổi / Tuần · Hypertrophy Ưu Tiên Độ Rộng Vai & Tay',
    weeklyWeights,
    weekOneSample: [
      {
        day: 'Buổi 1 · Upper Heavy',
        focus: 'Đẩy Ngang · Kéo Ngang Nền Tảng',
        exercises: [
          { name: 'Barbell Bench Press', setsReps: '4 × 5–7', loadKg: `${roundToQuarter(benchKg)} kg`, rpe: 'RPE 8' },
          { name: 'Barbell Bent-Over Row', setsReps: '4 × 6–8', loadKg: `${rowEst} kg`, rpe: 'RPE 8' },
          { name: 'Lateral Raise Cáp/Tạ đơn', setsReps: '4 × 12–15', loadKg: `${Math.max(5, Math.round(benchKg * 0.25))} kg`, rpe: 'RPE 9' },
        ],
      },
      {
        day: 'Buổi 2 · Lower + Posterior',
        focus: 'Squat & Hông Đẩy Khối Lượng Cơ Đùi',
        exercises: [
          { name: 'Barbell Back Squat', setsReps: '4 × 6–8', loadKg: `${squatEst} kg`, rpe: 'RPE 8' },
          { name: 'Stiff-Legged Deadlift', setsReps: '3 × 8–10', loadKg: `${deadliftEst} kg`, rpe: 'RPE 8' },
          { name: 'Leg Press / Walking Lunge', setsReps: '3 × 10–12', loadKg: `${roundToQuarter(squatEst * 1.3)} kg`, rpe: 'RPE 8.5' },
        ],
      },
    ],
  }
}

export const TRANSFORMATION_PLACEHOLDER_REMOVED = true
