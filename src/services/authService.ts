import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { randomBytes } from "crypto";
import { getJwtSecret } from "../utils/env";
import prisma from "../utils/prisma";
import { emailService } from "./emailService";
import { UserType, StaffPosition } from "@prisma/client";
import { auditService } from "./auditService";

export interface AuthResponse {
  success: boolean;
  message: string;
  data: {
    user: {
      id: string;
      email: string;
      profileImageUrl?: string;
      name: string;
      userType: UserType;
      studentInfo?: {
        id: string;
        name: string;
        email: string;
        phoneNumber: string;
        classid: string;
        class: {
          id: string;
          name: string;
          description: string;
        };
        subclass: {
          id: string;
          name: string;
        };
      };
      parentInfo?: {
        email: string;
        phoneNumber: string;
        students: {
          id: string;
          name: string;
          email: string;
          phoneNumber: string;
          imageUrl: string | null;
          classid: string;
          subclassId: string;
          class: {
            id: string;
            name: string;
            description: string;
          };
          subclass: {
            id: string;
            name: string;
          };
        }[];
      };
      teacherInfo?: {
        id: string;
        name: string;
        email: string;
        phoneNumber: string;
        classid: string;
        class: {
          id: string;
          name: string;
          description: string;
        };
        subclass: {
          id: string;
          name: string;
        };
      };
    };
    tokens: {
      accessToken: string;
      refreshToken: string;
      expiresIn: number;
    };
  };
}

export interface UserRegistrationInput {
  email: string;
  password?: string;
  firstName?: string;
  lastName?: string;
  phoneNumber?: string;
  profileImageUrl?: string;

  isActive?: boolean;
}

function buildTokens(user: any) {
  const accessExpiresInSeconds = 60 * 60 * 24 * 7; // 7 DAYS
  const refreshExpiresInSeconds = 60 * 60 * 24 * 7; // 7 days

  const accessToken = jwt.sign({ user }, getJwtSecret(), {
    expiresIn: accessExpiresInSeconds,
  });
  const refreshToken = jwt.sign({ ...user, type: "refresh" }, getJwtSecret(), {
    expiresIn: refreshExpiresInSeconds,
  });

  return { accessToken, refreshToken, expiresIn: accessExpiresInSeconds };
}

type AuthUser = AuthResponse["data"]["user"];
type UserProfileContext = Pick<AuthUser, "studentInfo" | "parentInfo" | "teacherInfo">;
type ClassInfo = NonNullable<AuthUser["studentInfo"]>["class"];
type SubclassInfo = NonNullable<AuthUser["studentInfo"]>["subclass"];

/** Contact details of the currently authenticating user (used for parent/teacher info). */
interface UserContact {
  email: string;
  phoneNumber?: string | null;
}

/** Staff positions that qualify a user for `teacherInfo`. */
const TEACHING_POSITIONS: StaffPosition[] = [
  StaffPosition.class_teacher,
  StaffPosition.assistant_teacher,
  StaffPosition.subject_teacher,
  StaffPosition.teacher,
];

const classSubclassSelect = {
  class: { select: { id: true, name: true } },
  subClass: { select: { id: true, name: true } },
} as const;

function fullName(...parts: (string | null | undefined)[]): string {
  return parts.filter(Boolean).join(" ");
}

// `SchoolClass` has no description column, so it is always returned as empty.
function mapClass(cls?: { id: string; name: string } | null): ClassInfo {
  return { id: cls?.id ?? "", name: cls?.name ?? "", description: "" };
}

function mapSubclass(sub?: { id: string; name: string } | null): SubclassInfo {
  return { id: sub?.id ?? "", name: sub?.name ?? "" };
}

function mapStudent(student: {
  id: string;
  firstName: string;
  middleName: string | null;
  lastName: string;
  studentEmail: string | null;
  guardianContact: string | null;
  classId: string | null;
  class: { id: string; name: string } | null;
  subClass: { id: string; name: string } | null;
}) {
  return {
    id: student.id,
    name: fullName(student.firstName, student.middleName, student.lastName),
    email: student.studentEmail ?? "",
    phoneNumber: student.guardianContact ?? "",
    classid: student.classId ?? "",
    class: mapClass(student.class),
    subclass: mapSubclass(student.subClass),
  };
}

export class AuthService {
  /**
   * Builds userType-specific context attached to the auth response:
   * - `studentInfo` for Student users (their own linked student record)
   * - `parentInfo` for Parent users (their linked students)
   * - `teacherInfo` for Staff users holding a teaching position
   */
  private async buildUserProfileContext(
    userId: string,
    userType: UserType,
    contact: UserContact
  ): Promise<UserProfileContext> {
    switch (userType) {
      case UserType.Student:
        return this.buildStudentContext(userId);
      case UserType.Parent:
        return this.buildParentContext(userId, contact);
      case UserType.Staff:
        return this.buildTeacherContext(userId, contact);
      default:
        return {};
    }
  }

  private async buildStudentContext(userId: string): Promise<UserProfileContext> {
    const student = await prisma.student.findFirst({
      where: { userId },
      include: classSubclassSelect,
    });

    if (!student) return {};

    return { studentInfo: mapStudent(student) };
  }

  private async buildParentContext(
    userId: string,
    contact: UserContact
  ): Promise<UserProfileContext> {
    const students = await prisma.student.findMany({
      where: { guardianEmail: contact.email },
      include: classSubclassSelect,
    });

    return {
      parentInfo: {
        email: contact.email,
        phoneNumber: contact.phoneNumber ?? "",
        students: students.map((student) => ({
          ...mapStudent(student),
          imageUrl: student.imageUrl ?? null,
          subclassId: student.subClassId ?? "",
        })),
      },
    };
  }

  private async buildTeacherContext(
    userId: string,
    contact: UserContact
  ): Promise<UserProfileContext> {
    const staff = await prisma.staff.findFirst({
      where: { userId, position: { in: TEACHING_POSITIONS } },
      include: {
        teacherSubjects: {
          orderBy: { updatedAt: "desc" },
          take: 1,
          include: {
            class: { select: { id: true, name: true } },
            subclass: { select: { id: true, name: true } },
          },
        },
      },
    });

    if (!staff) return {};

    const assignment = staff.teacherSubjects[0];

    return {
      teacherInfo: {
        id: staff.id,
        name: staff.name,
        email: staff.email,
        phoneNumber: contact.phoneNumber ?? "",
        classid: assignment?.classId ?? "",
        class: mapClass(assignment?.class),
        subclass: mapSubclass(assignment?.subclass),
      },
    };
  }

  async create(input: UserRegistrationInput): Promise<AuthResponse> {
    const { email, password, profileImageUrl } = input;
    // Check if user already exists by email
    let existingUser;
    existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser) {
      throw new Error("User already exists with this email");
    }

    // Hash password
    const validatedPassoword = password || "12345"; // auto-generated password
    const hashedPassword: string = await bcrypt.hash(validatedPassoword, 10);
    // Create user
    const user = await prisma.user.create({
      data: { ...input, password: hashedPassword, profileImageUrl },
      select: {
        id: true,
        email: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        profileImageUrl: true,
        userType: true,
      },
    });

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
    const tokens = buildTokens(user.id);
    const profileContext = await this.buildUserProfileContext(user.id, user.userType, {
      email: user.email,
      phoneNumber: user.phoneNumber,
    });

    return {
      success: true,
      message: "Registration successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          profileImageUrl: user.profileImageUrl ?? undefined,
          name,
          userType: user.userType,
          ...profileContext,
        },
        tokens,
      },
    };
  }

  async login(email: string, password: string, userType?: string): Promise<AuthResponse> {
    // Find user by email
    const where: any = { email };
    if (userType) {
      where.userType = userType;
    }
    // `findUnique` only works with unique fields; `userType` is not unique.
    // Use `findFirst` so the extra filter doesn't crash Prisma.
    const user = await prisma.user.findFirst({
      where,
      select: {
        id: true,
        email: true,
        password: true,
        firstName: true,
        lastName: true,
        phoneNumber: true,
        userType: true,

        isVerified: true,
        profileImageUrl: true,
      },
    });
    if (!user) {
      throw new Error("Invalid credentials");
    }
    // Verify password
    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch) {
      throw new Error("Invalid credentials");
    }

    const name = [user.firstName, user.lastName].filter(Boolean).join(" ") || "";
    const tokens = buildTokens({
      id: user.id,
      email: user.email,
      name,
      profileImageUrl: user.profileImageUrl ?? undefined,
    });
    auditService.createAuditLog({
      action: "LOGIN",
      entityType: "user",
      entityId: user.id,
      performedById: user.id,
      description: `User ${user.email} logged in`,
      oldValues: {},
      newValues: {},
      // ipAddress: request.ip,
      // userAgent: request.headers["user-agent"],
      // requestId: request.headers["x-request-id"],
      status: "SUCCESS",
    });
    const profileContext = await this.buildUserProfileContext(user.id, user.userType, {
      email: user.email,
      phoneNumber: user.phoneNumber,
    });
    return {
      success: true,
      message: "Login successful",
      data: {
        user: {
          id: user.id,
          email: user.email,
          name,
          profileImageUrl: user.profileImageUrl ?? undefined,
          userType: user.userType,
          ...profileContext,
        },
        tokens,
      },
    };
  }

  /**
   * Create a merchant user with optional outlet assignment
   */

  async getUserById(userId: string) {
    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, email: true, createdAt: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    return user;
  }

  /**
   * Request password reset - generates token and sends email
   */
  async forgotPassword(email: string): Promise<{ success: boolean; message: string }> {
    try {
      // Verify user exists
      const user = await prisma.user.findUnique({
        where: { email },
        select: {
          id: true,
          email: true,
          firstName: true,
          lastName: true,
        },
      });

      // Don't reveal if user exists or not for security
      if (!user) {
        return {
          success: true,
          message: "If an account with that email exists, a password reset link has been sent.",
        };
      }

      // Generate secure random token
      const resetToken = randomBytes(32).toString("hex");
      const expiresAt = new Date();
      expiresAt.setMinutes(expiresAt.getMinutes() + 10); // 10 minutes expiration

      // Delete any existing reset tokens for this user
      await prisma.passwordResetToken.deleteMany({
        where: { userId: user.id },
      });

      // Create new reset token
      await prisma.passwordResetToken.create({
        data: {
          userId: user.id,
          token: resetToken,
          expiresAt,
          used: false,
        },
      });

      // Build reset URL
      const frontendUrl =
        process.env.FRONTEND_URL || process.env.APP_URL || "http://localhost:3000";
      const resetLink = `${frontendUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(email)}`;

      // Get user name
      const userName = [user.firstName, user.lastName].filter(Boolean).join(" ") || "User";

      // Send password reset email
      await emailService.sendTemplateEmail({
        to: email,
        templateName: "passwordReset",
        data: {
          appName: "Lift Platform",
          userName,
          userEmail: email,
          resetLink,
          expirationTime: "10",
        },
      });

      return {
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      };
    } catch (error: any) {
      console.error("Error in forgotPassword:", error);
      // Still return success to prevent email enumeration
      return {
        success: true,
        message: "If an account with that email exists, a password reset link has been sent.",
      };
    }
  }

  /**
   * Reset password using token
   */
  async resetPassword(
    email: string,
    token: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; message: string }> {
    try {
      // Validate passwords match
      if (newPassword !== confirmPassword) {
        throw new Error("Passwords do not match");
      }

      // Validate password strength (minimum 6 characters)
      if (newPassword.length < 6) {
        throw new Error("Password must be at least 6 characters long");
      }

      // Find user
      const user = await prisma.user.findUnique({
        where: { email },
        select: { id: true, email: true },
      });

      if (!user) {
        throw new Error("Invalid reset token or email");
      }

      // Find valid reset token
      const resetToken = await prisma.passwordResetToken.findFirst({
        where: {
          userId: user.id,
          token,
          used: false,
          expiresAt: {
            gt: new Date(), // Token not expired
          },
        },
      });

      if (!resetToken) {
        throw new Error("Invalid or expired reset token");
      }

      // Hash new password
      const hashedPassword = await bcrypt.hash(newPassword, 10);

      // Update user password and mark token as used (transaction)
      await prisma.$transaction([
        prisma.user.update({
          where: { id: user.id },
          data: { password: hashedPassword },
        }),
        prisma.passwordResetToken.update({
          where: { id: resetToken.id },
          data: { used: true },
        }),
      ]);

      return {
        success: true,
        message: "Password has been reset successfully",
      };
    } catch (error: any) {
      throw new Error(error.message || "Failed to reset password");
    }
  }

  /**
   * Change password for an authenticated user (requires current password).
   */
  async changePassword(
    userId: string,
    currentPassword: string,
    newPassword: string,
    confirmPassword: string
  ): Promise<{ success: boolean; message: string }> {
    if (!currentPassword || !newPassword || !confirmPassword) {
      throw new Error("currentPassword, newPassword, and confirmPassword are required");
    }
    if (newPassword !== confirmPassword) {
      throw new Error("Passwords do not match");
    }
    if (newPassword.length < 6) {
      throw new Error("Password must be at least 6 characters long");
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { id: true, password: true },
    });

    if (!user) {
      throw new Error("User not found");
    }

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) {
      throw new Error("Current password is incorrect");
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return { success: true, message: "Password changed successfully" };
  }
}

export const authService = new AuthService();
