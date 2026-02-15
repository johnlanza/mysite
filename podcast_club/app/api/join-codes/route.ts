import { NextResponse } from 'next/server';
import { connectToDatabase } from '@/lib/db';
import { requireAdmin } from '@/lib/auth';
import { generateJoinCode, hashJoinCode, normalizeJoinCode } from '@/lib/join-codes';
import JoinCodeModel from '@/models/JoinCode';

export async function GET() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  await connectToDatabase();
  const activeCodes = await JoinCodeModel.countDocuments({ usedAt: null });
  return NextResponse.json({ activeCodes });
}

export async function POST() {
  const admin = await requireAdmin();
  if (!admin.ok) {
    return NextResponse.json({ message: admin.message }, { status: admin.status });
  }

  await connectToDatabase();

  for (let attempt = 0; attempt < 5; attempt += 1) {
    const code = generateJoinCode();
    const codeHash = hashJoinCode(normalizeJoinCode(code));

    try {
      await JoinCodeModel.create({
        codeHash,
        createdBy: admin.member._id
      });

      return NextResponse.json(
        {
          code,
          message: 'One-time join code generated. It can be used once.'
        },
        { status: 201 }
      );
    } catch (error) {
      if (error instanceof Error && /duplicate key/i.test(error.message)) {
        continue;
      }
      return NextResponse.json(
        { message: error instanceof Error ? error.message : 'Unable to generate join code.' },
        { status: 500 }
      );
    }
  }

  return NextResponse.json({ message: 'Unable to generate a unique join code. Try again.' }, { status: 500 });
}
