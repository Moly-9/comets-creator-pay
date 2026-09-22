export const passwordRequirements = (password: string) => ({
  length: password.length >= 8 && password.length <= 20,
  uppercase: /\p{Lu}/u.test(password),
  lowercase: /\p{Ll}/u.test(password),
  number: /\p{N}/u.test(password),
  noSpaces: !/\s/u.test(password),
});

export const validateAccountPassword = (password: string): string => {
  const requirements = passwordRequirements(password);
  if (!requirements.length) return "密码需为 8–20 位字符";
  if (!requirements.noSpaces) return "密码不能包含空格";
  if (!requirements.uppercase || !requirements.lowercase || !requirements.number) {
    return "密码须同时包含大写字母、小写字母和数字";
  }
  return "";
};
